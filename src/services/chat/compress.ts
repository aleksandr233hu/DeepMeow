import { collectCompletion } from '../api/complete.js'
import { getVisibleMessages } from './branches.js'
import { getContextRounds, getReplyText } from './reply.js'
import type { Compression, Message, Session } from './types.js'

/** 压缩时保留最近几轮原文，保证模型仍能看到当前语境 */
const KEEP_ROUNDS = 3
/** 单条消息与整体转录的长度上限，避免摘要请求本身过长 */
const MAX_MESSAGE_CHARS = 4000
const MAX_TRANSCRIPT_CHARS = 60_000

const SUMMARY_SYSTEM = [
  '你是对话压缩助手。把用户与助手的较早对话压缩成一份可继续对话使用的摘要。',
  '要求：',
  '1. 保留事实、用户偏好、结论、未完成事项、关键数字与专有名词；',
  '2. 删除寒暄、重复与无关内容，不要加入对话中没有的信息；',
  '3. 用简洁的中文要点分条输出，总长度不超过 600 字；',
  '4. 直接输出摘要正文，不要前言、标题或代码块。',
].join('\n')

export type CompressionFailure = 'tooShort' | 'empty'

export class CompressionError extends Error {
  readonly reason: CompressionFailure

  constructor(reason: CompressionFailure) {
    super(reason)
    this.name = 'CompressionError'
    this.reason = reason
  }
}

const clip = (text: string, limit: number) =>
  text.length > limit ? `${text.slice(0, limit)}…（已截断）` : text

/** 只剔除已压缩的消息；历史顺序与轮次配对保持不变。 */
export const excludeCovered = (compression: Compression | undefined, messages: Message[]) => {
  if (!compression || compression.coveredIds.length === 0) {
    return messages
  }
  const covered = new Set(compression.coveredIds)
  return messages.filter((message) => !covered.has(message.id))
}

/** 需要压缩的完整轮次：保留最近 KEEP_ROUNDS 轮，其余交给模型总结 */
export const planCompression = (session: Session) => {
  const visible = getVisibleMessages(session)
  const rounds = getContextRounds(visible)
  if (rounds.length <= KEEP_ROUNDS) {
    throw new CompressionError('tooShort')
  }
  const coveredRounds = rounds.slice(0, -KEEP_ROUNDS)
  const lastCovered = coveredRounds.at(-1)?.[1]
  const endIndex = lastCovered
    ? visible.findIndex((message) => message.id === lastCovered.id)
    : -1
  if (endIndex < 0) {
    throw new CompressionError('tooShort')
  }
  return {
    coveredIds: visible.slice(0, endIndex + 1).map((message) => message.id),
    transcript: coveredRounds
      .map(
        ([user, reply]) =>
          `用户：${clip(user.content || '[仅附件]', MAX_MESSAGE_CHARS)}\n助手：${clip(
            getReplyText(reply),
            MAX_MESSAGE_CHARS
          )}`
      )
      .join('\n\n'),
  }
}

/** 调用模型总结较早对话；失败时抛出 CompressionError 或 API 错误 */
export const summarizeSession = async ({
  session,
  apiKey,
  signal,
}: {
  session: Session
  apiKey: string
  signal: AbortSignal
}): Promise<Compression> => {
  const { coveredIds, transcript } = planCompression(session)
  if (transcript.trim().length < 20) {
    throw new CompressionError('tooShort')
  }
  const { text, usage } = await collectCompletion(
    apiKey,
    {
      model: 'deepseek-flash',
      system: SUMMARY_SYSTEM,
      messages: [
        {
          role: 'user',
          content: `请压缩下面的对话记录：\n\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`,
        },
      ],
      thinking: { type: 'disabled' },
      tools: [],
      safety_check: { level: 'high' },
    },
    signal
  )
  if (!text) {
    throw new CompressionError('empty')
  }
  return { summary: text, coveredIds, createdAt: Date.now(), usage }
}
