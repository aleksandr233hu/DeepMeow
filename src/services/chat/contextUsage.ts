import { getVisibleMessages } from './branches.js'
import { getReplyText } from './reply.js'
import type { Message, Session } from './types.js'

/** deepseek-flash 与 deepseek-v4-pro 的上下文窗口均为 1M */
export const CONTEXT_WINDOW = 1_000_000

export type ContextUsage = {
  used: number
  limit: number
  remaining: number
  /** 上次请求的未缓存输入 */
  input: number
  cacheCreation: number
  cacheRead: number
  output: number
  /** 数字是否包含按字符估算的部分 */
  estimated: boolean
  /** 是否有服务端返回的真实 usage */
  measured: boolean
}

/** 中英混排的粗略估算：约 2 个字符 / token */
const estimateTokens = (chars: number) => Math.ceil(chars / 2)

const messageChars = (message: Message) =>
  message.role === 'user' ? message.content.length : getReplyText(message).length

const sumChars = (messages: Message[]) =>
  messages.reduce((total, message) => total + messageChars(message), 0)

const emptyUsage = (estimated: boolean, used = 0): ContextUsage => ({
  used,
  limit: CONTEXT_WINDOW,
  remaining: Math.max(0, CONTEXT_WINDOW - used),
  input: estimated ? used : 0,
  cacheCreation: 0,
  cacheRead: 0,
  output: 0,
  estimated,
  measured: false,
})

/**
 * 上下文用量：
 * - 优先使用最近一条可见回复的 usage（未缓存输入 + 缓存写入 + 缓存读取 + 输出）；
 * - 该回复之后新增的消息按字符估算追加；
 * - 压缩发生在最近回复之后时，按压缩后保留的消息 + 摘要字符估算；
 * - 从未请求过时按全部消息字符估算。
 */
export const getContextUsage = (session: Session): ContextUsage => {
  const visible = getVisibleMessages(session)
  const compression = session.compression
  let lastIndex = -1
  for (let index = visible.length - 1; index >= 0; index--) {
    const message = visible[index]
    if (
      message &&
      message.role === 'assistant' &&
      message.usage &&
      (message.status === 'done' || message.status === 'stopped')
    ) {
      lastIndex = index
      break
    }
  }
  const last = lastIndex >= 0 ? visible[lastIndex] : undefined

  if (compression && (!last || compression.createdAt > last.createdAt)) {
    const covered = new Set(compression.coveredIds)
    const kept = visible.filter((message) => !covered.has(message.id))
    const used = estimateTokens(sumChars(kept) + compression.summary.length)
    return emptyUsage(true, used)
  }

  if (!last || last.role !== 'assistant' || !last.usage) {
    return emptyUsage(true, estimateTokens(sumChars(visible)))
  }

  const input = last.usage.input_tokens
  const cacheCreation = last.usage.cache_creation_input_tokens
  const cacheRead = last.usage.cache_read_input_tokens
  const output = last.usage.output_tokens
  const extra = estimateTokens(sumChars(visible.slice(lastIndex + 1)))
  const used = input + cacheCreation + cacheRead + output + extra
  return {
    used,
    limit: CONTEXT_WINDOW,
    remaining: Math.max(0, CONTEXT_WINDOW - used),
    input,
    cacheCreation,
    cacheRead,
    output,
    estimated: extra > 0,
    measured: true,
  }
}

/** 圆环里的短格式：12k / 354k / 1.0M */
export const formatContextTokens = (tokens: number): string => {
  if (tokens < 1_000) {
    return String(tokens)
  }
  if (tokens < 1_000_000) {
    return `${Math.round(tokens / 1_000)}k`
  }
  return `${(tokens / 1_000_000).toFixed(1)}M`
}
