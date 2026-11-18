import { create } from 'zustand'
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  readCurrentVersion,
  supportsInAppUpdate,
  type UpdateInfo,
} from './update.js'

/**
 * 更新状态：idle 未检查 / checking 检查中 / uptodate 已最新 /
 * available 有新版本 / downloading 下载中 / ready 安装包就绪 / failed 检查失败
 */
export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'uptodate'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'failed'

type UpdateState = {
  phase: UpdatePhase
  currentVersion: string
  info: UpdateInfo | null
  /** 下载进度 0–1，未知总大小时为 null */
  progress: number | null
  apkPath: string | null
  dialogOpen: boolean
  init: () => Promise<void>
  /** 手动检查：结果会显示在设置里，有更新时弹出更新窗口 */
  check: () => Promise<void>
  /** 启动时静默检查：只在发现新版本时弹窗，失败不提示 */
  autoCheck: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  openDialog: () => void
  closeDialog: () => void
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  phase: 'idle',
  currentVersion: '',
  info: null,
  progress: null,
  apkPath: null,
  dialogOpen: false,

  init: async () => {
    if (!supportsInAppUpdate()) {
      return
    }
    set({ currentVersion: await readCurrentVersion() })
  },

  autoCheck: async () => {
    if (!supportsInAppUpdate() || get().phase !== 'idle') {
      return
    }
    const result = await checkForUpdate()
    if (result.status === 'update') {
      set({ phase: 'available', info: result.info, dialogOpen: true })
    }
  },

  check: async () => {
    if (!supportsInAppUpdate() || get().phase === 'checking') {
      return
    }
    set({ phase: 'checking' })
    const result = await checkForUpdate()
    if (result.status === 'update') {
      set({ phase: 'available', info: result.info, dialogOpen: true })
    } else {
      set({ phase: result.status === 'latest' ? 'uptodate' : 'failed' })
    }
  },

  download: async () => {
    const { info, phase } = get()
    if (!info || phase === 'downloading') {
      return
    }
    set({ phase: 'downloading', progress: 0 })
    try {
      const path = await downloadUpdate(info.url, (loaded, total) => {
        set({ progress: total > 0 ? Math.min(1, loaded / total) : null })
      })
      set({ phase: 'ready', apkPath: path, progress: 1 })
    } catch {
      set({ phase: 'available', progress: null })
    }
  },

  install: async () => {
    const path = get().apkPath
    if (!path) {
      return
    }
    try {
      await installUpdate(path)
    } catch {
      set({ phase: 'available', apkPath: null, progress: null })
    }
  },

  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),
}))
