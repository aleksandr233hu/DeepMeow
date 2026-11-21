import { create } from 'zustand'
import type { TtsVoice } from './api/speech.js'
import type { IdentitySource } from './chat/identity.js'
import { normalizeLocation, type UserLocation } from './location.js'
import { migrateLegacyStylePreset, normalizeStyleProfile } from './style/text.js'
import type { StyleProfile } from './style/types.js'

export type Locale = 'zh-CN' | 'en-US'

/** 主题偏好；默认跟随系统 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** 回答风格：替代原来的单个 stylePreset，改为六项结构化配置 */
// 类型定义在 style/types.ts，设置里只保存对象

/** 用户气泡宽度 */
export type BubbleWidth = 'narrow' | 'comfortable' | 'wide'

/** 主题强调色 */
export type AccentColor = 'default' | 'blue' | 'green' | 'purple' | 'orange' | 'rose'

/** 字体：猫主题圆体，或跟随系统字体 */
export type FontPreference = 'round' | 'system'

/** 消息布局：经典无气泡平铺 / 双方气泡 */
export type MessageLayout = 'classic' | 'bubble'

/** 本机设置，存 localStorage：API Key、语言、主题、位置、朗读音色、深度思考与智能搜索开关、侧边栏收起状态，以及个性化配置 */
type Settings = {
  apiKey: string | null
  locale: Locale
  themePreference: ThemePreference
  location: UserLocation | null
  ttsVoice: TtsVoice
  thinking: boolean
  search: boolean
  siderCollapsed: boolean
  /** 生成参数：null 表示使用模型默认值 */
  temperature: number | null
  topP: number | null
  /** 新会话的 Agent 自定义指令 */
  agentInstructions: string
  /** 新会话默认身份来源：人格预设或 Agent 指令，二者只发送一个 */
  identitySource: IdentitySource
  /** 个性化：称呼与身份 */
  nickname: string
  occupation: string
  /** 自定义指令：关于我与回答方式 */
  aboutMe: string
  responseStyle: string
  styleProfile: StyleProfile
  /** 长期记忆开关 */
  memoryEnabled: boolean
  autoMemoryEnabled: boolean
  /** 每新增多少轮对话自动提取一次长期记忆（1-10） */
  autoMemoryRounds: number
  /** 新会话默认人格 */
  defaultPresetId: string | null
  /** 外观 */
  accentColor: AccentColor
  fontPreference: FontPreference
  fontScale: number
  bubbleWidth: BubbleWidth
  foldLongMessages: boolean
  /** 消息显示 */
  messageLayout: MessageLayout
  showAvatars: boolean
  showSystemPrompt: boolean
}

const KEYS = {
  apiKey: 'chat-demo:api-key',
  locale: 'chat-demo:locale',
  location: 'chat-demo:location',
  themePreference: 'chat-demo:theme-preference',
  ttsVoice: 'chat-demo:tts-voice',
  thinking: 'chat-demo:thinking',
  search: 'chat-demo:search',
  siderCollapsed: 'chat-demo:sider-collapsed',
  nickname: 'chat-demo:nickname',
  occupation: 'chat-demo:occupation',
  aboutMe: 'chat-demo:about-me',
  responseStyle: 'chat-demo:response-style',
  styleProfile: 'chat-demo:style-profile',
  memoryEnabled: 'chat-demo:memory-enabled',
  autoMemoryEnabled: 'chat-demo:auto-memory-enabled',
  autoMemoryRounds: 'chat-demo:auto-memory-rounds',
  defaultPresetId: 'chat-demo:default-preset-id',
  accentColor: 'chat-demo:accent-color',
  fontPreference: 'chat-demo:font-preference',
  fontScale: 'chat-demo:font-scale',
  bubbleWidth: 'chat-demo:bubble-width',
  foldLongMessages: 'chat-demo:fold-long-messages',
  temperature: 'chat-demo:temperature',
  topP: 'chat-demo:top-p',
  agentInstructions: 'chat-demo:agent-instructions',
  identitySource: 'chat-demo:identity-source',
  messageLayout: 'chat-demo:message-layout',
  showAvatars: 'chat-demo:show-avatars',
  showSystemPrompt: 'chat-demo:show-system-prompt',
} as const

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string | null) => {
  try {
    if (value === null) {
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
}

/** 位置选择模式跟随浏览器语言，与应用内选择的界面语言无关。 */
export const isChineseBrowser = (): boolean =>
  (typeof navigator === 'undefined' ? 'zh' : navigator.language).toLowerCase().startsWith('zh')

const initialLocale = (): Locale => {
  const saved = read(KEYS.locale)
  if (saved === 'zh-CN' || saved === 'en-US') {
    return saved
  }
  return isChineseBrowser() ? 'zh-CN' : 'en-US'
}

const initialLocation = (): UserLocation | null => {
  try {
    const location = normalizeLocation(JSON.parse(read(KEYS.location) ?? 'null'))
    if (!location) {
      return null
    }
    return isChineseBrowser()
      ? location.region === 'CN' && location.province
        ? location
        : null
      : { region: location.region }
  } catch {
    return null
  }
}

/** 未保存过时跟随系统 */
const initialThemePreference = (): ThemePreference => {
  const saved = read(KEYS.themePreference)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** 未保存过时默认使用暗潮（男声）；显式保存过海星的女声设置保持不变 */
const initialTtsVoice = (): TtsVoice => (read(KEYS.ttsVoice) === 'stella' ? 'stella' : 'tide')

const readBoolean = (key: string, fallback: boolean): boolean => {
  const value = read(key)
  return value === null ? fallback : value === 'true'
}

const ACCENT_COLORS: readonly AccentColor[] = [
  'default',
  'blue',
  'green',
  'purple',
  'orange',
  'rose',
]
const BUBBLE_WIDTHS: readonly BubbleWidth[] = ['narrow', 'comfortable', 'wide']

/** 新键优先；首次升级时把旧的单选回答风格映射成六项配置 */
const initialStyleProfile = (): StyleProfile => {
  const saved = read(KEYS.styleProfile)
  if (saved) {
    try {
      return normalizeStyleProfile(JSON.parse(saved))
    } catch {
      // 损坏时退回旧键或默认
    }
  }
  return migrateLegacyStylePreset(read('chat-demo:style-preset'))
}

const initialAccentColor = (): AccentColor => {
  const saved = read(KEYS.accentColor)
  return ACCENT_COLORS.find((value) => value === saved) ?? 'default'
}

const initialFontScale = (): number => {
  const saved = Number(read(KEYS.fontScale))
  return Number.isFinite(saved) && saved >= 0.85 && saved <= 1.3 ? saved : 1
}

/** 默认使用猫主题圆体，显式选择系统字体才切换 */
const initialFontPreference = (): FontPreference =>
  read(KEYS.fontPreference) === 'system' ? 'system' : 'round'

const initialBubbleWidth = (): BubbleWidth => {
  const saved = read(KEYS.bubbleWidth)
  return BUBBLE_WIDTHS.find((value) => value === saved) ?? 'comfortable'
}

/** null 表示模型默认；范围外的旧值按默认处理 */
const initialTemperature = (): number | null => {
  const saved = read(KEYS.temperature)
  if (saved === null || saved === '') {
    return null
  }
  const value = Number(saved)
  return Number.isFinite(value) && value >= 0 && value <= 2 ? value : null
}

/** 自动提取记忆的轮数间隔：整数 1-10，默认 2 */
export const clampAutoMemoryRounds = (value: number) =>
  Math.min(10, Math.max(1, Math.round(value)))

const initialAutoMemoryRounds = (): number => {
  const saved = Number(read(KEYS.autoMemoryRounds))
  return Number.isFinite(saved) && saved >= 1 ? clampAutoMemoryRounds(saved) : 2
}

const initialTopP = (): number | null => {
  const value = Number(read(KEYS.topP))
  return Number.isFinite(value) && value > 0 && value <= 1 ? value : null
}

/** Agent 自定义指令的默认内容：首次启动或用户清空后使用 */
const DEFAULT_AGENT_INSTRUCTIONS =
  '你就是 DeepMeow，一只赛博英短蓝猫，用中文回答问题。称呼用户“你”。DeepMeow为无性别设定。用户提到“DeepMeow”时指代的就是你。'

const initialAgentInstructions = (): string => {
  const saved = read(KEYS.agentInstructions) ?? read('chat-demo:default-system-prompt')
  return saved?.trim() ? saved : DEFAULT_AGENT_INSTRUCTIONS
}

const initialMessageLayout = (): MessageLayout =>
  read(KEYS.messageLayout) === 'bubble' ? 'bubble' : 'classic'

export const useSettings = create<Settings>(() => ({
  apiKey: read(KEYS.apiKey),
  locale: initialLocale(),
  location: initialLocation(),
  themePreference: initialThemePreference(),
  ttsVoice: initialTtsVoice(),
  thinking: read(KEYS.thinking) === 'true',
  search: read(KEYS.search) === 'true',
  siderCollapsed: read(KEYS.siderCollapsed) === 'true',
  nickname: read(KEYS.nickname) ?? '',
  occupation: read(KEYS.occupation) ?? '',
  aboutMe: read(KEYS.aboutMe) ?? '',
  responseStyle: read(KEYS.responseStyle) ?? '',
  styleProfile: initialStyleProfile(),
  memoryEnabled: readBoolean(KEYS.memoryEnabled, true),
  autoMemoryEnabled: readBoolean(KEYS.autoMemoryEnabled, true),
  autoMemoryRounds: initialAutoMemoryRounds(),
  defaultPresetId: read(KEYS.defaultPresetId),
  accentColor: initialAccentColor(),
  fontPreference: initialFontPreference(),
  fontScale: initialFontScale(),
  bubbleWidth: initialBubbleWidth(),
  foldLongMessages: readBoolean(KEYS.foldLongMessages, true),
  temperature: initialTemperature(),
  topP: initialTopP(),
  agentInstructions: initialAgentInstructions(),
  identitySource: read(KEYS.identitySource) === 'agent' ? 'agent' : 'persona',
  messageLayout: initialMessageLayout(),
  showAvatars: readBoolean(KEYS.showAvatars, true),
  showSystemPrompt: readBoolean(KEYS.showSystemPrompt, false),
}))

export const setLocale = (locale: Locale) => {
  write(KEYS.locale, locale)
  useSettings.setState({ locale })
}

export const setLocation = (value: UserLocation | null) => {
  const location = normalizeLocation(value)
  write(KEYS.location, location ? JSON.stringify(location) : null)
  useSettings.setState({ location })
}

export const setThemePreference = (themePreference: ThemePreference) => {
  write(KEYS.themePreference, themePreference)
  useSettings.setState({ themePreference })
}

export const setTtsVoice = (ttsVoice: TtsVoice) => {
  write(KEYS.ttsVoice, ttsVoice)
  useSettings.setState({ ttsVoice })
}

export const setApiKey = (apiKey: string | null) => {
  write(KEYS.apiKey, apiKey)
  useSettings.setState({ apiKey })
}

export const setThinking = (thinking: boolean) => {
  write(KEYS.thinking, String(thinking))
  useSettings.setState({ thinking })
}

export const setSearch = (search: boolean) => {
  write(KEYS.search, String(search))
  useSettings.setState({ search })
}

export const setSiderCollapsed = (siderCollapsed: boolean) => {
  write(KEYS.siderCollapsed, String(siderCollapsed))
  useSettings.setState({ siderCollapsed })
}

export const setNickname = (nickname: string) => {
  write(KEYS.nickname, nickname)
  useSettings.setState({ nickname })
}

export const setOccupation = (occupation: string) => {
  write(KEYS.occupation, occupation)
  useSettings.setState({ occupation })
}

export const setAboutMe = (aboutMe: string) => {
  write(KEYS.aboutMe, aboutMe)
  useSettings.setState({ aboutMe })
}

export const setResponseStyle = (responseStyle: string) => {
  write(KEYS.responseStyle, responseStyle)
  useSettings.setState({ responseStyle })
}

export const setStyleProfile = (styleProfile: StyleProfile) => {
  write(KEYS.styleProfile, JSON.stringify(styleProfile))
  useSettings.setState({ styleProfile })
}

export const setMemoryEnabled = (memoryEnabled: boolean) => {
  write(KEYS.memoryEnabled, String(memoryEnabled))
  useSettings.setState({ memoryEnabled })
}

export const setAutoMemoryEnabled = (autoMemoryEnabled: boolean) => {
  write(KEYS.autoMemoryEnabled, String(autoMemoryEnabled))
  useSettings.setState({ autoMemoryEnabled })
}

export const setAutoMemoryRounds = (autoMemoryRounds: number) => {
  const value = clampAutoMemoryRounds(autoMemoryRounds)
  write(KEYS.autoMemoryRounds, String(value))
  useSettings.setState({ autoMemoryRounds: value })
}

export const setDefaultPresetId = (defaultPresetId: string | null) => {
  write(KEYS.defaultPresetId, defaultPresetId)
  useSettings.setState({ defaultPresetId })
}

export const setAccentColor = (accentColor: AccentColor) => {
  write(KEYS.accentColor, accentColor)
  useSettings.setState({ accentColor })
}

export const setFontPreference = (fontPreference: FontPreference) => {
  write(KEYS.fontPreference, fontPreference)
  useSettings.setState({ fontPreference })
}

export const setFontScale = (fontScale: number) => {
  write(KEYS.fontScale, String(fontScale))
  useSettings.setState({ fontScale })
}

export const setBubbleWidth = (bubbleWidth: BubbleWidth) => {
  write(KEYS.bubbleWidth, bubbleWidth)
  useSettings.setState({ bubbleWidth })
}

export const setFoldLongMessages = (foldLongMessages: boolean) => {
  write(KEYS.foldLongMessages, String(foldLongMessages))
  useSettings.setState({ foldLongMessages })
}

export const setTemperature = (temperature: number | null) => {
  write(KEYS.temperature, temperature === null ? null : String(temperature))
  useSettings.setState({ temperature })
}

export const setTopP = (topP: number | null) => {
  write(KEYS.topP, topP === null ? null : String(topP))
  useSettings.setState({ topP })
}

export const setAgentInstructions = (agentInstructions: string) => {
  write(KEYS.agentInstructions, agentInstructions)
  useSettings.setState({ agentInstructions })
}

export const setIdentitySource = (identitySource: IdentitySource) => {
  write(KEYS.identitySource, identitySource)
  useSettings.setState({ identitySource })
}

export const setMessageLayout = (messageLayout: MessageLayout) => {
  write(KEYS.messageLayout, messageLayout)
  useSettings.setState({ messageLayout })
}

export const setShowAvatars = (showAvatars: boolean) => {
  write(KEYS.showAvatars, String(showAvatars))
  useSettings.setState({ showAvatars })
}

export const setShowSystemPrompt = (showSystemPrompt: boolean) => {
  write(KEYS.showSystemPrompt, String(showSystemPrompt))
  useSettings.setState({ showSystemPrompt })
}
