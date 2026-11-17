/** 记忆文本规范化：折叠空白、去掉句末标点、转小写，用于精确去重 */
export const normalizeMemoryText = (text: string): string =>
  text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[。．.!！?？,，;；:：]+$/g, '')
    .toLowerCase()

/** 单条记忆的长度上限，避免把整段对话塞进记忆 */
export const MAX_MEMORY_CHARS = 300
