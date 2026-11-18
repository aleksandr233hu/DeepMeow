import { create } from 'zustand'
import { createId } from '../../utils/id.js'
import * as db from '../chat/db.js'
import { MAX_MEMORY_CHARS, normalizeMemoryText } from './text.js'
import type { MemoryRecord, MemorySource } from './types.js'

/** 记忆总量上限，超出后淘汰最早写入的条目 */
const MAX_MEMORIES = 100

type MemoryState = {
  ready: boolean
  memories: MemoryRecord[]
}

export const useMemoryStore = create<MemoryState>(() => ({
  ready: false,
  memories: [],
}))

let initTask: Promise<void> | undefined

const sortMemories = (memories: MemoryRecord[]) =>
  [...memories].sort((a, b) => b.createdAt - a.createdAt)

const setMemories = (memories: MemoryRecord[]) =>
  useMemoryStore.setState({ memories: sortMemories(memories) })

/** 版本记忆的固定 id：升级时更新同一条，不会越积越多 */
const VERSION_MEMORY_ID = 'deepmeow-version'

/** 把当前版本写进长期记忆，让模型能回答「你是什么版本」 */
const ensureVersionMemory = async (): Promise<void> => {
  const text = `DeepMeow 当前版本 v${__APP_VERSION__}`
  const normalized = normalizeMemoryText(text)
  const current = useMemoryStore.getState().memories
  const existing = current.find((memory) => memory.id === VERSION_MEMORY_ID)
  if (existing) {
    if (existing.text === text) {
      return
    }
    const updated: MemoryRecord = { ...existing, text, normalized, updatedAt: Date.now() }
    try {
      await db.saveMemory(updated)
    } catch (error) {
      db.reportStorageError('update version memory')(error)
      return
    }
    setMemories(current.map((memory) => (memory.id === VERSION_MEMORY_ID ? updated : memory)))
    return
  }
  const now = Date.now()
  const record: MemoryRecord = {
    id: VERSION_MEMORY_ID,
    text,
    normalized,
    source: 'auto',
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await db.saveMemory(record)
  } catch (error) {
    db.reportStorageError('save version memory')(error)
    return
  }
  setMemories([...current, record])
}

/** 首次启动加载；失败时也标记 ready，避免阻塞界面 */
export const initMemories = (): Promise<void> => {
  if (useMemoryStore.getState().ready) {
    return Promise.resolve()
  }
  initTask ??= (async () => {
    try {
      setMemories(await db.loadMemories())
      await ensureVersionMemory()
    } catch (error) {
      db.reportStorageError('load memories')(error)
    } finally {
      useMemoryStore.setState({ ready: true })
      initTask = undefined
    }
  })()
  return initTask
}

/** 新增记忆：规范化后精确去重；空文本与重复文本返回 null */
export const addMemory = async (
  text: string,
  source: MemorySource
): Promise<MemoryRecord | null> => {
  const content = text.trim().replace(/\s+/g, ' ').slice(0, MAX_MEMORY_CHARS)
  const normalized = normalizeMemoryText(content)
  if (content.length < 2) {
    return null
  }
  const current = useMemoryStore.getState().memories
  if (current.some((memory) => memory.normalized === normalized)) {
    return null
  }
  const now = Date.now()
  const memory: MemoryRecord = {
    id: createId(),
    text: content,
    normalized,
    source,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  }
  try {
    await db.saveMemory(memory)
    const next = sortMemories([memory, ...current])
    const removed = next.slice(MAX_MEMORIES)
    if (removed.length > 0) {
      await Promise.all(removed.map((item) => db.deleteMemory(item.id)))
    }
    setMemories(next.slice(0, MAX_MEMORIES))
    return memory
  } catch (error) {
    db.reportStorageError('save memory')(error)
    return null
  }
}

export const updateMemory = async (
  id: string,
  patch: { text?: string; enabled?: boolean }
): Promise<boolean> => {
  const current = useMemoryStore.getState().memories
  const memory = current.find((item) => item.id === id)
  if (!memory) {
    return false
  }
  const text =
    patch.text === undefined
      ? memory.text
      : patch.text.trim().replace(/\s+/g, ' ').slice(0, MAX_MEMORY_CHARS)
  if (text.length < 2) {
    return false
  }
  const next: MemoryRecord = {
    ...memory,
    text,
    normalized: normalizeMemoryText(text),
    enabled: patch.enabled ?? memory.enabled,
    updatedAt: Date.now(),
  }
  try {
    await db.saveMemory(next)
    setMemories(current.map((item) => (item.id === id ? next : item)))
    return true
  } catch (error) {
    db.reportStorageError('update memory')(error)
    return false
  }
}

export const removeMemory = async (id: string): Promise<boolean> => {
  try {
    await db.deleteMemory(id)
    setMemories(useMemoryStore.getState().memories.filter((item) => item.id !== id))
    return true
  } catch (error) {
    db.reportStorageError('delete memory')(error)
    return false
  }
}

/** 请求时注入的记忆文本：只取启用项，最新在前 */
export const enabledMemoryTexts = (): string[] =>
  useMemoryStore
    .getState()
    .memories.filter((memory) => memory.enabled)
    .map((memory) => memory.text)
