/** 基础风格和语气：与 ChatGPT 的七种预设一一对应 */
export type StyleBase =
  | 'default'
  | 'professional'
  | 'friendly'
  | 'blunt'
  | 'imaginative'
  | 'efficient'
  | 'sarcastic'

/** 五个可调维度：增强 / 默认 / 减弱 */
export type StyleLevel = 'default' | 'more' | 'less'

export type StyleDimension = 'friendliness' | 'upbeat' | 'emoji' | 'visual' | 'headings'

export type StyleProfile = {
  base: StyleBase
  friendliness: StyleLevel
  upbeat: StyleLevel
  emoji: StyleLevel
  visual: StyleLevel
  headings: StyleLevel
}

export const STYLE_BASES: readonly StyleBase[] = [
  'default',
  'professional',
  'friendly',
  'blunt',
  'imaginative',
  'efficient',
  'sarcastic',
]

export const STYLE_LEVELS: readonly StyleLevel[] = ['default', 'more', 'less']

export const STYLE_DIMENSIONS: readonly StyleDimension[] = [
  'friendliness',
  'upbeat',
  'emoji',
  'visual',
  'headings',
]

export const DEFAULT_STYLE_PROFILE: StyleProfile = {
  base: 'default',
  friendliness: 'default',
  upbeat: 'default',
  emoji: 'default',
  visual: 'default',
  headings: 'default',
}
