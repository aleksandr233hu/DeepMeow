import { create } from 'zustand'
import { createId } from '../../utils/id.js'
import * as db from '../chat/db.js'
import { useSettings } from '../settings.js'
import { createBuiltinPresets } from './defaults.js'
import type { Preset } from './types.js'

type PresetState = {
  ready: boolean
  presets: Preset[]
}

export const usePresetStore = create<PresetState>(() => ({
  ready: false,
  presets: [],
}))

const BUILTIN_ORDER = [
  'builtin-general',
  'builtin-analyst',
  'builtin-companion',
  'builtin-engineer',
]

const rank = (preset: Preset) =>
  preset.builtin ? BUILTIN_ORDER.indexOf(preset.id) : BUILTIN_ORDER.length

const sortPresets = (presets: Preset[]) =>
  [...presets].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)

const setPresets = (presets: Preset[]) =>
  usePresetStore.setState({ presets: sortPresets(presets) })

let initTask: Promise<void> | undefined

/** 首次启动加载预设；数据库为空时写入内置人格 */
export const initPresets = (): Promise<void> => {
  if (usePresetStore.getState().ready) {
    return Promise.resolve()
  }
  initTask ??= (async () => {
    try {
      let presets = await db.loadPresets()
      if (presets.length === 0) {
        presets = createBuiltinPresets()
        await Promise.all(presets.map((preset) => db.savePreset(preset)))
      }
      setPresets(presets)
    } catch (error) {
      db.reportStorageError('load presets')(error)
    } finally {
      usePresetStore.setState({ ready: true })
      initTask = undefined
    }
  })()
  return initTask
}

export const addPreset = async ({
  name,
  systemPrompt,
}: {
  name: string
  systemPrompt: string
}): Promise<Preset | null> => {
  const trimmedName = name.trim().slice(0, 40)
  const trimmedPrompt = systemPrompt.trim()
  if (!trimmedName || !trimmedPrompt) {
    return null
  }
  const now = Date.now()
  const preset: Preset = {
    id: createId(),
    name: trimmedName,
    // 预设不再使用 emoji 图标；字段保留以兼容旧数据
    emoji: '',
    systemPrompt: trimmedPrompt,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await db.savePreset(preset)
    setPresets([...usePresetStore.getState().presets, preset])
    return preset
  } catch (error) {
    db.reportStorageError('save preset')(error)
    return null
  }
}

export const updatePreset = async (
  id: string,
  patch: { name?: string; emoji?: string; systemPrompt?: string }
): Promise<boolean> => {
  const current = usePresetStore.getState().presets
  const preset = current.find((item) => item.id === id)
  if (!preset) {
    return false
  }
  const name = (patch.name ?? preset.name).trim().slice(0, 40)
  const systemPrompt = (patch.systemPrompt ?? preset.systemPrompt).trim()
  if (!name || !systemPrompt) {
    return false
  }
  const next: Preset = {
    ...preset,
    name,
    systemPrompt,
    emoji: (patch.emoji ?? preset.emoji).trim(),
    updatedAt: Date.now(),
  }
  try {
    await db.savePreset(next)
    setPresets(current.map((item) => (item.id === id ? next : item)))
    return true
  } catch (error) {
    db.reportStorageError('update preset')(error)
    return false
  }
}

/** 内置人格不可删除，避免用户把默认人格删空 */
export const removePreset = async (id: string): Promise<boolean> => {
  const current = usePresetStore.getState().presets
  const preset = current.find((item) => item.id === id)
  if (!preset || preset.builtin) {
    return false
  }
  try {
    await db.deletePreset(id)
    setPresets(current.filter((item) => item.id !== id))
    return true
  } catch (error) {
    db.reportStorageError('delete preset')(error)
    return false
  }
}

/** 会话未指定时使用默认预设，再退回通用助手 */
export const resolvePreset = (presetId: string | null | undefined): Preset | undefined => {
  const presets = usePresetStore.getState().presets
  const explicit = presetId ? presets.find((preset) => preset.id === presetId) : undefined
  if (explicit) {
    return explicit
  }
  const defaultId = useSettings.getState().defaultPresetId
  return (
    presets.find((preset) => preset.id === defaultId) ??
    presets.find((preset) => preset.id === 'builtin-general') ??
    presets[0]
  )
}
