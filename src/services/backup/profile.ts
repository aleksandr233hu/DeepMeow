import * as db from '../chat/db.js'
import type { IdentitySource } from '../chat/identity.js'
import { useAvatarStore } from '../avatar/store.js'
import { AVATAR_ROLES, type AvatarRole } from '../avatar/types.js'
import { useMemoryStore } from '../memory/store.js'
import type { MemoryRecord } from '../memory/types.js'
import { usePresetStore } from '../presets/store.js'
import type { Preset } from '../presets/types.js'
import { STYLE_BASES, STYLE_LEVELS, type StyleProfile } from '../style/types.js'
import type { UserLocation } from '../location.js'
import type { TtsVoice } from '../api/speech.js'
import {
  setAboutMe,
  setAccentColor,
  setAgentInstructions,
  setAutoMemoryEnabled,
  setBubbleWidth,
  setDefaultPresetId,
  setFoldLongMessages,
  setFontPreference,
  setFontScale,
  setIdentitySource,
  setLocale,
  setLocation,
  setMemoryEnabled,
  setMessageLayout,
  setNickname,
  setOccupation,
  setResponseStyle,
  setShowAvatars,
  setShowSystemPrompt,
  setStyleProfile,
  setTemperature,
  setThemePreference,
  setTopP,
  setTtsVoice,
  useSettings,
  type AccentColor,
  type BubbleWidth,
  type FontPreference,
  type Locale,
  type MessageLayout,
  type ThemePreference,
} from '../settings.js'
import { formatDate } from '../../utils/format.js'

/** 个性化备份：设置 + 记忆 + 人格预设 + 头像；不含 API Key 与对话 */
const FORMAT = 'deepmeow-profile'
const VERSION = 1

const ACCENTS: readonly AccentColor[] = ['default', 'blue', 'green', 'purple', 'orange', 'rose']
const BUBBLES: readonly BubbleWidth[] = ['narrow', 'comfortable', 'wide']
const LAYOUTS: readonly MessageLayout[] = ['classic', 'bubble']
const THEMES: readonly ThemePreference[] = ['light', 'dark', 'system']
const FONTS: readonly FontPreference[] = ['round', 'system']
const LOCALES: readonly Locale[] = ['zh-CN', 'en-US']
const VOICES: readonly TtsVoice[] = ['stella', 'tide']
const IDENTITIES: readonly IdentitySource[] = ['persona', 'agent']

type ProfileSettings = {
  nickname: string
  occupation: string
  aboutMe: string
  responseStyle: string
  styleProfile: StyleProfile
  agentInstructions: string
  identitySource: IdentitySource
  defaultPresetId: string | null
  memoryEnabled: boolean
  autoMemoryEnabled: boolean
  temperature: number | null
  topP: number | null
  messageLayout: MessageLayout
  showAvatars: boolean
  showSystemPrompt: boolean
  accentColor: AccentColor
  fontPreference: FontPreference
  fontScale: number
  bubbleWidth: BubbleWidth
  foldLongMessages: boolean
  themePreference: ThemePreference
  ttsVoice: TtsVoice
  locale: Locale
  location: UserLocation | null
  thinking: boolean
  search: boolean
}

type AvatarBackup = { mimeType: string; data: string }

type ProfileBackup = {
  format: typeof FORMAT
  version: typeof VERSION
  exportedAt: string
  settings: ProfileSettings
  memories: MemoryRecord[]
  presets: Preset[]
  avatars: Partial<Record<AvatarRole, AvatarBackup>>
}

export type ProfileImportResult = { memories: number; presets: number; avatars: number }

const invalid = (): never => {
  throw new Error('invalid profile backup')
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid()

const text = (value: unknown): string => (typeof value === 'string' ? value : invalid())
const flag = (value: unknown): boolean => (typeof value === 'boolean' ? value : invalid())
const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : invalid()
const nullableNum = (value: unknown): number | null => (value === null ? null : num(value))
const choice = <T extends string>(allowed: readonly T[], value: unknown): T =>
  allowed.includes(value as T) ? (value as T) : invalid()

const readStyleProfile = (value: unknown): StyleProfile => {
  const item = record(value)
  return {
    base: choice(STYLE_BASES, item.base),
    friendliness: choice(STYLE_LEVELS, item.friendliness),
    upbeat: choice(STYLE_LEVELS, item.upbeat),
    emoji: choice(STYLE_LEVELS, item.emoji),
    visual: choice(STYLE_LEVELS, item.visual),
    headings: choice(STYLE_LEVELS, item.headings),
  }
}

const readLocation = (value: unknown): UserLocation | null => {
  if (value === null) {
    return null
  }
  const item = record(value)
  return {
    region: text(item.region),
    ...(typeof item.province === 'string' ? { province: item.province } : {}),
    ...(typeof item.city === 'string' ? { city: item.city } : {}),
  }
}

const readSettings = (value: unknown): ProfileSettings => {
  const item = record(value)
  return {
    nickname: text(item.nickname),
    occupation: text(item.occupation),
    aboutMe: text(item.aboutMe),
    responseStyle: text(item.responseStyle),
    styleProfile: readStyleProfile(item.styleProfile),
    agentInstructions: text(item.agentInstructions),
    identitySource: choice(IDENTITIES, item.identitySource),
    defaultPresetId: item.defaultPresetId === null ? null : text(item.defaultPresetId),
    memoryEnabled: flag(item.memoryEnabled),
    autoMemoryEnabled: flag(item.autoMemoryEnabled),
    temperature: nullableNum(item.temperature),
    topP: nullableNum(item.topP),
    messageLayout: choice(LAYOUTS, item.messageLayout),
    showAvatars: flag(item.showAvatars),
    showSystemPrompt: flag(item.showSystemPrompt),
    accentColor: choice(ACCENTS, item.accentColor),
    fontPreference: choice(FONTS, item.fontPreference),
    fontScale: num(item.fontScale),
    bubbleWidth: choice(BUBBLES, item.bubbleWidth),
    foldLongMessages: flag(item.foldLongMessages),
    themePreference: choice(THEMES, item.themePreference),
    ttsVoice: choice(VOICES, item.ttsVoice),
    locale: choice(LOCALES, item.locale),
    location: readLocation(item.location),
    thinking: flag(item.thinking),
    search: flag(item.search),
  }
}

const readMemories = (value: unknown): MemoryRecord[] => {
  if (!Array.isArray(value)) {
    return invalid()
  }
  return value.slice(0, 100).map((entry) => {
    const item = record(entry)
    return {
      id: text(item.id),
      text: text(item.text),
      normalized: text(item.normalized),
      source: item.source === 'manual' ? 'manual' : 'auto',
      enabled: flag(item.enabled),
      createdAt: num(item.createdAt),
      updatedAt: num(item.updatedAt),
    }
  })
}

const readPresets = (value: unknown): Preset[] => {
  if (!Array.isArray(value)) {
    return invalid()
  }
  return value.map((entry) => {
    const item = record(entry)
    return {
      id: text(item.id),
      name: text(item.name),
      emoji: typeof item.emoji === 'string' ? item.emoji : '',
      systemPrompt: text(item.systemPrompt),
      builtin: flag(item.builtin),
      createdAt: num(item.createdAt),
      updatedAt: num(item.updatedAt),
    }
  })
}

const readAvatars = (value: unknown): Partial<Record<AvatarRole, AvatarBackup>> => {
  const item = record(value)
  const result: Partial<Record<AvatarRole, AvatarBackup>> = {}
  for (const role of AVATAR_ROLES) {
    const entry = item[role]
    if (entry === undefined) {
      continue
    }
    const avatar = record(entry)
    if (typeof avatar.data !== 'string' || avatar.data === '') {
      continue
    }
    result[role] = { mimeType: text(avatar.mimeType), data: avatar.data }
  }
  return result
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })

const base64ToBlob = (data: string, mimeType: string): Blob => {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

/** 导出设置、记忆、人格预设与头像；不含 API Key 和对话内容。 */
export const exportProfile = async (): Promise<{ name: string; blob: Blob }> => {
  const state = useSettings.getState()
  const avatars: Partial<Record<AvatarRole, AvatarBackup>> = {}
  for (const record of await db.loadAvatars()) {
    avatars[record.id] = { mimeType: record.mimeType, data: await blobToBase64(record.blob) }
  }
  const backup: ProfileBackup = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    settings: {
      nickname: state.nickname,
      occupation: state.occupation,
      aboutMe: state.aboutMe,
      responseStyle: state.responseStyle,
      styleProfile: state.styleProfile,
      agentInstructions: state.agentInstructions,
      identitySource: state.identitySource,
      defaultPresetId: state.defaultPresetId,
      memoryEnabled: state.memoryEnabled,
      autoMemoryEnabled: state.autoMemoryEnabled,
      temperature: state.temperature,
      topP: state.topP,
      messageLayout: state.messageLayout,
      showAvatars: state.showAvatars,
      showSystemPrompt: state.showSystemPrompt,
      accentColor: state.accentColor,
      fontPreference: state.fontPreference,
      fontScale: state.fontScale,
      bubbleWidth: state.bubbleWidth,
      foldLongMessages: state.foldLongMessages,
      themePreference: state.themePreference,
      ttsVoice: state.ttsVoice,
      locale: state.locale,
      location: state.location,
      thinking: state.thinking,
      search: state.search,
    },
    memories: useMemoryStore.getState().memories,
    presets: usePresetStore.getState().presets,
    avatars,
  }
  const date = formatDate(new Date()) ?? 'backup'
  return {
    name: `deepmeow-profile-${date}.json`,
    blob: new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
  }
}

/**
 * 恢复个性化备份：设置直接覆盖；记忆与人格按 id 合并，已存在的跳过；
 * 头像覆盖现有自定义头像。文件格式不对时抛错，不做任何修改。
 */
export const importProfile = async (file: File): Promise<ProfileImportResult> => {
  const parsed: unknown = JSON.parse(await file.text())
  const item = record(parsed)
  if (item.format !== FORMAT || item.version !== VERSION) {
    invalid()
  }
  const settings = readSettings(item.settings)
  const memories = readMemories(item.memories)
  const presets = readPresets(item.presets)
  const avatars = readAvatars(item.avatars)

  setNickname(settings.nickname)
  setOccupation(settings.occupation)
  setAboutMe(settings.aboutMe)
  setResponseStyle(settings.responseStyle)
  setStyleProfile(settings.styleProfile)
  setAgentInstructions(settings.agentInstructions)
  setIdentitySource(settings.identitySource)
  setDefaultPresetId(settings.defaultPresetId)
  setMemoryEnabled(settings.memoryEnabled)
  setAutoMemoryEnabled(settings.autoMemoryEnabled)
  setTemperature(settings.temperature)
  setTopP(settings.topP)
  setMessageLayout(settings.messageLayout)
  setShowAvatars(settings.showAvatars)
  setShowSystemPrompt(settings.showSystemPrompt)
  setAccentColor(settings.accentColor)
  setFontPreference(settings.fontPreference)
  setFontScale(settings.fontScale)
  setBubbleWidth(settings.bubbleWidth)
  setFoldLongMessages(settings.foldLongMessages)
  setThemePreference(settings.themePreference)
  setTtsVoice(settings.ttsVoice)
  setLocale(settings.locale)
  setLocation(settings.location)
  // 思考与搜索是会话默认开关，没有独立 setter，直接写入并同步状态
  useSettings.setState({ thinking: settings.thinking, search: settings.search })

  const existingMemories = new Set(useMemoryStore.getState().memories.map((entry) => entry.id))
  const addedMemories: MemoryRecord[] = []
  for (const memory of memories) {
    if (existingMemories.has(memory.id)) {
      continue
    }
    await db.saveMemory(memory)
    addedMemories.push(memory)
  }
  if (addedMemories.length > 0) {
    useMemoryStore.setState({
      memories: [...useMemoryStore.getState().memories, ...addedMemories]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100),
    })
  }

  const existingPresets = new Set(usePresetStore.getState().presets.map((entry) => entry.id))
  const addedPresets: Preset[] = []
  for (const preset of presets) {
    if (existingPresets.has(preset.id)) {
      continue
    }
    await db.savePreset(preset)
    addedPresets.push(preset)
  }
  if (addedPresets.length > 0) {
    usePresetStore.setState((state) => ({ presets: [...state.presets, ...addedPresets] }))
  }

  let avatarCount = 0
  for (const role of AVATAR_ROLES) {
    const entry = avatars[role]
    if (!entry) {
      continue
    }
    const blob = base64ToBlob(entry.data, entry.mimeType)
    await db.saveAvatar({ id: role, blob, mimeType: entry.mimeType, updatedAt: Date.now() })
    useAvatarStore.setState((state) => ({ avatars: { ...state.avatars, [role]: blob } }))
    avatarCount += 1
  }

  return { memories: addedMemories.length, presets: addedPresets.length, avatars: avatarCount }
}
