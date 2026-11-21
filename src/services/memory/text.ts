import type { MemorySource } from './types.js'

/** 记忆文本规范化：折叠空白、去掉句末标点、转小写，用于精确去重 */
export const normalizeMemoryText = (text: string): string =>
  text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[。．.!！?？,，;；:：]+$/g, '')
    .toLowerCase()

/** 普通记忆的单条长度上限，避免把整段对话塞进记忆 */
export const MAX_MEMORY_CHARS = 300

/** 会话摘要允许更长，是一整篇文章而不是一小条 */
export const MAX_SUMMARY_CHARS = 2000

export const memoryCharLimit = (source: MemorySource) =>
  source === 'auto' ? MAX_MEMORY_CHARS : MAX_SUMMARY_CHARS
