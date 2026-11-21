import { create } from 'zustand'
import {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
  readCurrentVersion,
  supportsInAppUpdate,
  type UpdateInfo,
} from './update.js'
import {
  applyWebUpdate,
  BUILTIN_WEB_VERSION,
  checkWebUpdate,
  readNextWebVersion,
  readWebVersion,
  supportsLiveUpdate,
} from './liveUpdate.js'

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

/** 网页资源：idle / checking / downloading / latest / pending（已下载待下次启动）/ failed / requiresApp */
export type WebPhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'latest'
  | 'pending'
  | 'failed'
  | 'requiresApp'

type UpdateState = {
  phase: UpdatePhase
  currentVersion: string
  info: UpdateInfo | null
  /** 下载进度 0–1，未知总大小时为 null */
  progress: number | null
  apkPath: string | null
  dialogOpen: boolean
  /** 网页资源热更新 */
  webPhase: WebPhase
  webVersion: string
  webNextVersion: string | null
  webRequiredAppVersion: string | null
  init: () => Promise<void>
  /** 手动检查：结果会显示在设置里，有更新时弹出更新窗口 */
  check: () => Promise<void>
  /** 启动时静默检查：只在发现新版本时弹窗，失败不提示 */
  autoCheck: () => Promise<void>
  download: () => Promise<void>
  install: () => Promise<void>
  openDialog: () => void
  closeDialog: () => void
  initWeb: () => Promise<void>
  /** 手动检查网页更新；发现即下载，下次启动生效 */
  checkWeb: () => Promise<void>
  /** 启动时静默检查网页更新 */
  autoCheckWeb: () => Promise<void>
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  phase: 'idle',
  currentVersion: '',
  info: null,
  progress: null,
  apkPath: null,
  dialogOpen: false,
  webPhase: 'idle',
  webVersion: BUILTIN_WEB_VERSION,
  webNextVersion: null,
  webRequiredAppVersion: null,

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

  initWeb: async () => {
    if (!supportsLiveUpdate()) {
      return
    }
    set({
      webVersion: await readWebVersion(),
      webNextVersion: await readNextWebVersion(),
    })
  },

  checkWeb: async () => {
    if (!supportsLiveUpdate()) {
      return
    }
    const busy = get().webPhase === 'checking' || get().webPhase === 'downloading'
    if (busy) {
      return
    }
    set({ webPhase: 'checking' })
    const result = await checkWebUpdate()
    if (result.status === 'update') {
      set({ webPhase: 'downloading' })
      try {
        await applyWebUpdate(result.info)
        set({
          webPhase: 'pending',
          webNextVersion: result.info.version,
          webVersion: await readWebVersion(),
        })
      } catch {
        set({ webPhase: 'failed' })
      }
    } else if (result.status === 'pending') {
      set({ webPhase: 'pending', webNextVersion: result.version })
    } else if (result.status === 'latest') {
      set({ webPhase: 'latest', webVersion: result.version })
    } else if (result.status === 'requiresApp') {
      set({
        webPhase: 'requiresApp',
        webRequiredAppVersion: result.minAppVersion,
      })
    } else {
      set({ webPhase: 'failed' })
    }
  },

  autoCheckWeb: async () => {
    if (!supportsLiveUpdate() || get().webPhase !== 'idle') {
      return
    }
    const result = await checkWebUpdate()
    if (result.status === 'update') {
      try {
        await applyWebUpdate(result.info)
        set({ webPhase: 'pending', webNextVersion: result.info.version })
      } catch {
        set({ webPhase: 'failed' })
      }
    } else if (result.status === 'pending') {
      set({ webPhase: 'pending', webNextVersion: result.version })
    }
  },
}))
