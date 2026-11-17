import type { Preset } from '../presets/types.js'
import { describeStyleProfile } from '../style/text.js'
import type { StyleProfile } from '../style/types.js'
import type { Compression } from './types.js'

/** 所有请求统一携带的助手身份说明 */
const BASE_PROMPT = '该助手为DeepSeek，由深度求索公司创造。'

/** 注入的记忆上限：条数与总字数都设上限，避免系统提示词失控 */
const MEMORY_LIMIT = 40
const MEMORY_CHARS = 1500
const MEMORY_ITEM_CHARS = 200

export type SystemPromptOptions = {
  compression?: Compression
  /** 用户在全局或会话里填写的 Agent 自定义指令 */
  agentInstructions?: string
  preset?: Preset
  nickname?: string
  occupation?: string
  aboutMe?: string
  responseStyle?: string
  styleProfile?: StyleProfile
  memories?: string[]
}

/**
 * 组装系统提示词：基础身份 → Agent 自定义指令 → 人格预设 → 用户资料 → 自定义指令 → 回答风格 → 长期记忆 → 更早对话的摘要。
 * 各段为空时省略；记忆按条数与字数截断。
 */
export const buildSystemPrompt = ({
  compression,
  agentInstructions,
  preset,
  nickname,
  occupation,
  aboutMe,
  responseStyle,
  styleProfile,
  memories = [],
}: SystemPromptOptions = {}): string => {
  const sections = [BASE_PROMPT]

  if (agentInstructions?.trim()) {
    sections.push(`# Agent 自定义指令\n${agentInstructions.trim()}`)
  }

  if (preset?.systemPrompt.trim()) {
    sections.push(`# 当前人格\n${preset.systemPrompt.trim()}`)
  }

  const profile = [
    nickname?.trim() ? `称呼：${nickname.trim()}` : '',
    occupation?.trim() ? `身份：${occupation.trim()}` : '',
  ].filter(Boolean)
  if (profile.length > 0) {
    sections.push(`# 关于用户\n${profile.join('\n')}`)
  }

  const instructions = [
    aboutMe?.trim() ? `关于你：${aboutMe.trim()}` : '',
    responseStyle?.trim() ? `希望的回答方式：${responseStyle.trim()}` : '',
  ].filter(Boolean)
  if (instructions.length > 0) {
    sections.push(`# 自定义指令\n${instructions.join('\n')}`)
  }

  const styleLines = styleProfile ? describeStyleProfile(styleProfile) : []
  if (styleLines.length > 0) {
    sections.push(`# 回答风格\n${styleLines.join('\n')}`)
  }

  const memoryLines: string[] = []
  let remaining = MEMORY_CHARS
  for (const memory of memories) {
    const text = memory.trim().slice(0, MEMORY_ITEM_CHARS)
    if (!text || remaining < text.length + 2) {
      continue
    }
    memoryLines.push(`- ${text}`)
    remaining -= text.length + 2
    if (memoryLines.length >= MEMORY_LIMIT) {
      break
    }
  }
  if (memoryLines.length > 0) {
    sections.push(
      `# 长期记忆\n以下内容由用户允许长期保存，请自然地运用，不要逐条复述：\n${memoryLines.join('\n')}`
    )
  }

  if (compression?.summary.trim()) {
    sections.push(
      `# 更早对话的摘要\n以下是对此前对话的压缩摘要，请把它当作已经发生过的上下文继续对话：\n${compression.summary.trim()}`
    )
  }

  return sections.join('\n\n')
}
