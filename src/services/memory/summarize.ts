import { collectCompletion } from '../api/complete.js'
import { getVisibleMessages } from '../chat/branches.js'
import { getContextRounds, getReplyText } from '../chat/reply.js'
import type { Session } from '../chat/types.js'

/** 单次请求塞入的会话文本上限，超过就分段总结再合并 */
const CHUNK_CHARS = 12_000
/** 摘要目标长度；记忆存储另有 2000 字硬上限 */
const MAX_SUMMARY_CHARS = 1800

const SUMMARY_PROMPT = [
  '你负责把一整段会话压缩成一篇可长期保存的中文摘要，供以后继续对话时参考。',
  '按「主题 / 已确认的事实 / 用户的偏好与背景 / 结论与待办」分段，不要用 Markdown 标题符号。',
  '只保留具体、可复用的信息，不要寒暄、不要复述过程、不要编造。',
  `全文控制在 ${MAX_SUMMARY_CHARS} 字以内。`,
  '如果这段会话没有值得长期保存的信息，只输出「没有值得长期保存的信息」。',
].join('\n')

const MERGE_PROMPT = [
  '下面是对同一会话分段生成的摘要。',
  '请合并成一篇连贯的中文摘要，去掉重复，保留「主题 / 已确认的事实 / 用户的偏好与背景 / 结论与待办」。',
  `全文控制在 ${MAX_SUMMARY_CHARS} 字以内，不要编造原文没有的信息。`,
].join('\n')

export type SummaryScope = 'full' | 20 | 50 | 100

const chunkBlocks = (blocks: string[]): string[] => {
  const chunks: string[] = []
  let current = ''
  for (const block of blocks) {
    if (current && current.length + block.length + 2 > CHUNK_CHARS) {
      chunks.push(current)
      current = block
    } else {
      current = current ? `${current}\n\n${block}` : block
    }
  }
  if (current) {
    chunks.push(current)
  }
  return chunks
}

const complete = async (apiKey: string, system: string, content: string, signal: AbortSignal) => {
  const { text } = await collectCompletion(
    apiKey,
    {
      model: 'deepseek-flash',
      system,
      messages: [{ role: 'user', content }],
      thinking: { type: 'disabled' },
      tools: [],
      safety_check: { level: 'high' },
    },
    signal
  )
  return text.trim()
}

/**
 * 把一个会话总结成一篇长摘要（长期记忆用）。
 * 会话很长时按段总结再合并，onProgress 回报进度，signal 可取消。
 */
export const summarizeSessionToMemory = async ({
  session,
  apiKey,
  scope,
  onProgress,
  signal,
}: {
  session: Session
  apiKey: string
  scope: SummaryScope
  onProgress?: (done: number, total: number) => void
  signal: AbortSignal
}): Promise<string> => {
  const rounds = getContextRounds(getVisibleMessages(session))
  const selected = scope === 'full' ? rounds : rounds.slice(-scope)
  if (selected.length === 0) {
    return ''
  }
  const blocks = selected.map(
    ([user, reply]) => `用户：${user.content}\n助手：${getReplyText(reply)}`
  )
  const chunks = chunkBlocks(blocks.filter((block) => block.trim().length > 0))
  if (chunks.length === 0) {
    return ''
  }
  if (chunks.length === 1) {
    onProgress?.(1, 1)
    const text = await complete(apiKey, SUMMARY_PROMPT, chunks[0], signal)
    return text.slice(0, MAX_SUMMARY_CHARS)
  }
  const partials: string[] = []
  for (const [index, chunk] of chunks.entries()) {
    onProgress?.(index + 1, chunks.length + 1)
    partials.push(await complete(apiKey, SUMMARY_PROMPT, chunk, signal))
    if (signal.aborted) {
      return ''
    }
  }
  onProgress?.(chunks.length + 1, chunks.length + 1)
  const merged = await complete(apiKey, MERGE_PROMPT, partials.join('\n\n---\n\n'), signal)
  return merged.slice(0, MAX_SUMMARY_CHARS)
}
