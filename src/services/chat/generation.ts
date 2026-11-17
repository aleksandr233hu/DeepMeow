import type { Session } from './types.js'

/** 全局生成参数与 Agent 自定义指令的默认值 */
export type GenerationDefaults = {
  temperature: number | null
  topP: number | null
  agentInstructions: string
}

export type EffectiveGeneration = {
  temperature: number | null
  topP: number | null
  agentInstructions: string
}

/** 温度 0–2；null 表示模型默认 */
export const clampTemperature = (value: number | null): number | null =>
  value === null ? null : Math.min(2, Math.max(0, value))

/** top_p 大于 0 且不超过 1；null 表示模型默认 */
export const clampTopP = (value: number | null): number | null =>
  value === null ? null : Math.min(1, Math.max(0.01, value))

/**
 * 会话覆盖优先于全局默认；字段未设置时自动跟随全局。
 * 全局为 null 时请求里不发送该参数，交给模型默认值。
 */
export const resolveGeneration = (
  session: Session | undefined,
  settings: GenerationDefaults
): EffectiveGeneration => {
  const override = session?.generation
  return {
    temperature: clampTemperature(
      override?.temperature === undefined ? settings.temperature : override.temperature
    ),
    topP: clampTopP(override?.topP === undefined ? settings.topP : override.topP),
    agentInstructions:
      override?.systemPrompt === undefined ? settings.agentInstructions : override.systemPrompt,
  }
}
