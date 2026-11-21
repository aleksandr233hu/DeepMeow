/** 长期记忆条目：完全存本地，请求时按开关注入系统提示词 */
export type MemorySource = 'auto' | 'manual' | 'summary'

export type MemoryRecord = {
  id: string
  text: string
  /** 规范化文本，用于去重 */
  normalized: string
  source: MemorySource
  enabled: boolean
  createdAt: number
  updatedAt: number
}
