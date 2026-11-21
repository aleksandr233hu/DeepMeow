import { collectCompletion } from '../api/complete.js'
import { getVisibleMessages } from '../chat/branches.js'
import { getContextRounds, getReplyText } from '../chat/reply.js'
import type { Session } from '../chat/types.js'
import { addMemory, enabledMemoryTexts } from './store.js'

const MAX_FACTS = 3
const MAX_TRANSCRIPT_CHARS = 8000
/** 提取时随提示词带上的已有记忆数量上限，用于压住语义重复 */
const MAX_EXISTING_MEMORIES = 40

const SYSTEM_PROMPT = [
  '你负责从对话中提取值得长期记住的用户信息。',
  '只输出一个 JSON 字符串数组，最多 3 条，每条是一句简短的中文陈述。',
  '只记录稳定的偏好、身份、背景、长期目标或重要约定；',
  '不要记录一次性任务、寒暄、对助手的评价，以及密码、密钥、联系方式等敏感信息。',
  '如果已有记忆里已经包含同样的信息，不要再输出；有新信息时优先补充而不是重复。',
  '没有可记的内容时输出 []。不要输出任何其他文字。',
].join('\n')

const extracting = new Set<string>()

/** 从模型回复中宽容地解析 JSON 数组；失败返回空数组 */
export const parseMemoryFacts = (text: string): string[] => {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start < 0 || end <= start) {
    return []
  }
  try {
    const data: unknown = JSON.parse(cleaned.slice(start, end + 1))
    if (!Array.isArray(data)) {
      return []
    }
    return data
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && item.length <= 200)
      .slice(0, MAX_FACTS)
  } catch {
    return []
  }
}

/** 游标之后还剩多少轮完整对话；游标找不到（被删或切换分支）时返回 null */
export const pendingRounds = (
  rounds: readonly [unknown, unknown][],
  cursorUserId: string | undefined
): number | null => {
  if (!cursorUserId) {
    return rounds.length
  }
  const index = rounds.findIndex(([user]) => (user as { id?: string }).id === cursorUserId)
  return index < 0 ? null : rounds.length - (index + 1)
}

/**
 * 后台自动提取长期记忆：距上次提取新增了 every 轮才触发，且同一会话同时只跑一个。
 * 已提取到的位置记录在会话的 memoryCursor 上（最后覆盖到的提问消息 id），
 * 重启、删除消息或切换分支都不会把同一批轮次再提取一遍。
 */
export const extractMemories = async ({
  session,
  apiKey,
  every,
  onExtracted,
}: {
  session: Session
  apiKey: string
  /** 每新增多少轮提取一次 */
  every: number
  /** 提取结束后回报最后覆盖到的提问消息 id；undefined 表示清空游标 */
  onExtracted: (userMessageId: string | undefined) => void
}): Promise<void> => {
  const step = Math.max(1, Math.round(every))
  if (!apiKey || extracting.has(session.id)) {
    return
  }
  const rounds = getContextRounds(getVisibleMessages(session))
  const pending = pendingRounds(rounds, session.memoryCursor?.userMessageId)
  if (pending === null) {
    // 游标已失效：对齐到当前末条并跳过本次，避免重复提取
    onExtracted(rounds.at(-1)?.[0].id)
    return
  }
  if (pending < step) {
    return
  }
  extracting.add(session.id)
  try {
    // 从游标之后开始，一次覆盖所有积压轮次；过长时截取尾部
    const covered = rounds.length - pending
    const transcript = rounds
      .slice(covered)
      .map(([user, reply]) => `用户：${user.content}\n助手：${getReplyText(reply)}`)
      .join('\n\n')
      .slice(-MAX_TRANSCRIPT_CHARS)
    if (transcript.trim().length >= 10) {
      const existing = enabledMemoryTexts().slice(0, MAX_EXISTING_MEMORIES)
      const system = existing.length
        ? `${SYSTEM_PROMPT}\n\n已有记忆（不要重复记录）：\n${existing.join('\n')}`
        : SYSTEM_PROMPT
      const { text } = await collectCompletion(
        apiKey,
        {
          model: 'deepseek-flash',
          system,
          messages: [{ role: 'user', content: transcript }],
          thinking: { type: 'disabled' },
          tools: [],
          safety_check: { level: 'high' },
        },
        new AbortController().signal
      )
      for (const fact of parseMemoryFacts(text)) {
        await addMemory(fact, 'auto')
      }
    }
    onExtracted(rounds.at(-1)?.[0].id)
  } catch {
    // 自动提取失败不打断对话，游标不前进，下次再试
  } finally {
    extracting.delete(session.id)
  }
}
