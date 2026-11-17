import {
  DEFAULT_STYLE_PROFILE,
  STYLE_BASES,
  STYLE_DIMENSIONS,
  STYLE_LEVELS,
  type StyleBase,
  type StyleDimension,
  type StyleLevel,
  type StyleProfile,
} from './types.js'

/** 基础语气对应的系统提示词；默认不追加任何指令 */
export const BASE_STYLE_PROMPTS: Record<Exclude<StyleBase, 'default'>, string> = {
  professional: '整体语气：专业、可靠、精确，措辞严谨。',
  friendly: '整体语气：亲和、友善、温和健谈。',
  blunt: '整体语气：直言不讳、坦率，必要时直接指出问题。',
  imaginative: '整体语气：富有想象力和趣味，允许比喻与联想。',
  efficient: '整体语气：高效务实、简练直接，少铺垫。',
  sarcastic: '整体语气：带一点犀利幽默和吐槽感，但不冒犯、不牺牲准确性。',
}

/** 各维度增强 / 减弱时追加的指令；默认不追加 */
export const STYLE_DIMENSION_PROMPTS: Record<
  StyleDimension,
  Record<Exclude<StyleLevel, 'default'>, string>
> = {
  friendliness: {
    more: '语气更亲切、更有人情味。',
    less: '语气更克制、更客观。',
  },
  upbeat: {
    more: '表达更有活力、更积极。',
    less: '表达更冷静、中立。',
  },
  emoji: {
    more: '可以适当多使用表情符号，但不要滥用。',
    less: '尽量少用或不用表情符号。',
  },
  visual: {
    more: '在合适时使用表格、图示或结构化排版增强表达。',
    less: '以标准文字段落为主，少用可视化或交互式内容。',
  },
  headings: {
    more: '多用标题和列表组织内容，层次清晰。',
    less: '以段落文本为主，少用标题和列表。',
  },
}

/** 只输出非默认项；顺序固定为基础风格、亲切、热情、表情、可视化、标题列表 */
export const describeStyleProfile = (profile: StyleProfile): string[] => {
  const lines: string[] = []
  if (profile.base !== 'default') {
    lines.push(BASE_STYLE_PROMPTS[profile.base])
  }
  for (const dimension of STYLE_DIMENSIONS) {
    const level = profile[dimension]
    if (level !== 'default') {
      lines.push(STYLE_DIMENSION_PROMPTS[dimension][level])
    }
  }
  return lines
}

/** 旧版单选值迁移到新的基础风格 */
export const migrateLegacyStylePreset = (value: string | null): StyleProfile => {
  switch (value) {
    case 'concise':
      return { ...DEFAULT_STYLE_PROFILE, base: 'efficient' }
    case 'friendly':
      return { ...DEFAULT_STYLE_PROFILE, base: 'friendly' }
    case 'formal':
    case 'detailed':
      return { ...DEFAULT_STYLE_PROFILE, base: 'professional' }
    default:
      return DEFAULT_STYLE_PROFILE
  }
}

const isBase = (value: unknown): value is StyleBase =>
  typeof value === 'string' && (STYLE_BASES as readonly string[]).includes(value)

const isLevel = (value: unknown): value is StyleLevel =>
  typeof value === 'string' && (STYLE_LEVELS as readonly string[]).includes(value)

/** 解析 localStorage / 导入数据里的风格对象，非法字段回退到默认 */
export const normalizeStyleProfile = (value: unknown): StyleProfile => {
  if (typeof value !== 'object' || value === null) {
    return DEFAULT_STYLE_PROFILE
  }
  const record = value as Record<string, unknown>
  return {
    base: isBase(record.base) ? record.base : 'default',
    friendliness: isLevel(record.friendliness) ? record.friendliness : 'default',
    upbeat: isLevel(record.upbeat) ? record.upbeat : 'default',
    emoji: isLevel(record.emoji) ? record.emoji : 'default',
    visual: isLevel(record.visual) ? record.visual : 'default',
    headings: isLevel(record.headings) ? record.headings : 'default',
  }
}
