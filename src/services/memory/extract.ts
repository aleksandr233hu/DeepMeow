import { collectCompletion } from '../api/complete.js'
import { getVisibleMessages } from '../chat/branches.js'
import { getContextRounds, getReplyText } from '../chat/reply.js'
import type { Session } from '../chat/types.js'
import { addMemory } from './store.js'

/** 每两轮完整对话提取一次，避免每轮都产生额外调用 */
const EXTRACT_EVERY_ROUNDS = 2
const MAX_FACTS = 3
const MAX_TRANSCRIPT_CHARS = 8000

const SYSTEM_PROMPT = [
  '你负责从对话中提取值得长期记住的用户信息。',
  '只输出一个 JSON 字符串数组，最多 3 条，每条是一句简短的中文陈述。',
  '只记录稳定的偏好、身份、背景、长期目标或重要约定；',
  '不要记录一次性任务、寒暄、对助手的评价，以及密码、密钥、联系方式等敏感信息。',
  '没有可记的内容时输出 []。不要输出任何其他文字。',
].join('\n')

const lastExtractedRound = new Map<string, number>()
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

/**
 * 后台自动提取长期记忆：只在完整轮次达到偶数时触发，且同一轮次只跑一次。
 * 失败静默，不影响对话。
 */
export const extractMemories = async ({
  session,
  apiKey,
}: {
  session: Session
  apiKey: string
}): Promise<void> => {
  if (!apiKey || extracting.has(session.id)) {
    return
  }
  const rounds = getContextRounds(getVisibleMessages(session))
  if (rounds.length < EXTRACT_EVERY_ROUNDS || rounds.length % EXTRACT_EVERY_ROUNDS !== 0) {
    return
  }
  if (lastExtractedRound.get(session.id) === rounds.length) {
    return
  }
  extracting.add(session.id)
  try {
    const transcript = rounds
      .slice(-EXTRACT_EVERY_ROUNDS)
      .map(
        ([user, reply]) =>
          `用户：${user.content}\n助手：${getReplyText(reply)}`
      )
      .join('\n\n')
      .slice(-MAX_TRANSCRIPT_CHARS)
    if (transcript.trim().length < 10) {
      return
    }
    const { text } = await collectCompletion(
      apiKey,
      {
        model: 'deepseek-flash',
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: transcript }],
        thinking: { type: 'disabled' },
        tools: [],
        safety_check: { level: 'high' },
      },
      new AbortController().signal
    )
    const facts = parseMemoryFacts(text)
    for (const fact of facts) {
      await addMemory(fact, 'auto')
    }
    lastExtractedRound.set(session.id, rounds.length)
  } catch {
    // 自动提取失败不打断对话，下一轮再试
  } finally {
    extracting.delete(session.id)
  }
}
