import { getVisibleMessages, normalizeSession } from '../chat/branches.js'
import * as db from '../chat/db.js'
import type { SessionSummary } from '../chat/types.js'
import { setFirstApiKeyAt, useSettings } from '../settings.js'

/** 「猫窝日记」的本地统计：首次扫描后按增量累加，不联网 */
const STORAGE_KEY = 'deepmeow:diary-stats'
const DAY = 86_400_000

export type DiaryStats = {
  /** 历史扫描完成的时间；null 表示还没扫描过 */
  scanAt: number | null
  /** 累计提问轮数（按用户消息计） */
  rounds: number
  /** 按小时统计的用户消息数，24 项 */
  hours: number[]
}

const emptyStats = (): DiaryStats => ({ scanAt: null, rounds: 0, hours: Array(24).fill(0) })

export const readDiaryStats = (): DiaryStats => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return emptyStats()
    }
    const data = JSON.parse(raw) as Partial<DiaryStats>
    const hours = Array.isArray(data.hours) && data.hours.length === 24
      ? data.hours.map((value) => (Number.isFinite(value) ? value : 0))
      : Array(24).fill(0)
    return {
      scanAt: typeof data.scanAt === 'number' ? data.scanAt : null,
      rounds: typeof data.rounds === 'number' && data.rounds >= 0 ? data.rounds : 0,
      hours,
    }
  } catch {
    return emptyStats()
  }
}

const saveDiaryStats = (stats: DiaryStats) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {
    // 存储不可用时静默
  }
}

/**
 * 新提问计入统计：只在历史扫描完成后累加，且早于扫描时间的消息不重复计。
 */
export const recordQuestion = (createdAt = Date.now()) => {
  const stats = readDiaryStats()
  if (stats.scanAt === null || createdAt <= stats.scanAt) {
    return
  }
  stats.rounds += 1
  stats.hours[new Date(createdAt).getHours()] += 1
  saveDiaryStats(stats)
}

/**
 * 首次统计历史：逐个会话读取正文，统计用户消息数与小时分布。
 * 可随时取消；取消时不写入结果。
 */
export const scanDiary = async ({
  sessions,
  onProgress,
  signal,
}: {
  sessions: SessionSummary[]
  onProgress?: (done: number, total: number) => void
  signal: AbortSignal
}): Promise<DiaryStats> => {
  let rounds = 0
  const hours = Array(24).fill(0)
  for (const [index, summary] of sessions.entries()) {
    if (signal.aborted) {
      throw new DOMException('aborted', 'AbortError')
    }
    const stored = await db.loadSession(summary.id)
    if (stored) {
      for (const message of getVisibleMessages(normalizeSession(stored))) {
        if (message.role === 'user') {
          rounds += 1
          hours[new Date(message.createdAt).getHours()] += 1
        }
      }
    }
    onProgress?.(index + 1, sessions.length)
  }
  const stats: DiaryStats = { scanAt: Date.now(), rounds, hours }
  saveDiaryStats(stats)
  return stats
}

/** 首次接入 API 的日期：优先读设置；老数据用最早会话时间补齐 */
export const resolveFirstApiKeyAt = (sessions: SessionSummary[]): number | null => {
  const settings = useSettings.getState()
  if (settings.firstApiKeyAt !== null) {
    return settings.firstApiKeyAt
  }
  if (!settings.apiKey) {
    return null
  }
  const earliest = sessions.length
    ? Math.min(...sessions.map((session) => session.createdAt))
    : Date.now()
  setFirstApiKeyAt(earliest)
  return earliest
}

/** 养了几天：不足一天按 1 天算 */
export const daysSince = (time: number) =>
  Math.max(1, Math.floor((Date.now() - time) / DAY) + 1)

/** 最常用的时间段（0–23 点）；没有数据时返回 null */
export const busiestHour = (hours: number[]): number | null => {
  let best: number | null = null
  hours.forEach((value, hour) => {
    if (value > 0 && (best === null || value > hours[best])) {
      best = hour
    }
  })
  return best
}
