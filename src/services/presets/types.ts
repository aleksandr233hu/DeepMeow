/** 人格预设：可保存多套系统提示词，按会话切换 */
export type Preset = {
  id: string
  name: string
  emoji: string
  systemPrompt: string
  builtin: boolean
  createdAt: number
  updatedAt: number
}
