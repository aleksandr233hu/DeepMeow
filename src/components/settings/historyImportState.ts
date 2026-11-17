import { create } from 'zustand'
import { importHistory, ImportCancelled } from '../../services/chat/backup.js'
import { createImportControl, type ImportControl } from '../../services/chat/history/importControl.js'
import type { SettingStatus } from './SettingCell.js'

/**
 * 导入历史对话的全局状态：待确认文件、进行中进度和上一次结果都放在组件之外，
 * 关闭设置再打开时不会丢失，导入过程也不会因为弹窗卸载而中断。
 */
type HistoryImportState = {
  /** 已选中但尚未确认的文件 */
  file: File | null
  busy: boolean
  /** 用户暂停了正在进行的导入 */
  paused: boolean
  /** 已读取字节占文件的比例，0–1；非导入中为 null */
  progress: number | null
  status: SettingStatus
  select: (file: File) => void
  cancel: () => void
  confirm: () => Promise<void>
  pause: () => void
  resume: () => void
  /** 放弃正在进行的导入，清空已写入的暂存与进度 */
  abort: () => void
}

/** 防止重复点击确认；导入本身由 backup 队列串行 */
let importing = false
/** 当前导入的暂停 / 取消控制器，仅在导入期间存在 */
let control: ImportControl | null = null

export const useHistoryImport = create<HistoryImportState>((set, get) => ({
  file: null,
  busy: false,
  paused: false,
  progress: null,
  status: null,

  select: (file) => set({ file }),

  cancel: () => set({ file: null }),

  pause: () => {
    if (!control || !get().busy) {
      return
    }
    control.pause()
    set({ paused: true })
  },

  resume: () => {
    control?.resume()
    set({ paused: false })
  },

  abort: () => {
    control?.cancel()
  },

  confirm: async () => {
    const file = get().file
    if (!file || importing) {
      return
    }
    importing = true
    const current = createImportControl()
    control = current
    set({
      file: null,
      busy: true,
      paused: false,
      progress: 0,
      status: { key: 'historyImporting' },
    })
    try {
      const { imported, skipped } = await importHistory(
        file,
        (loaded, total) => {
          set({ progress: total > 0 ? Math.min(1, loaded / total) : 0 })
        },
        current
      )
      set({
        status:
          imported === 0
            ? { key: 'historyImportAllSkipped', params: { count: skipped } }
            : skipped === 0
              ? {
                  key: imported === 1 ? 'historyImportedOne' : 'historyImported',
                  params: { count: imported },
                }
              : { key: 'historyImportedWithSkipped', params: { count: imported, skipped } },
      })
    } catch (error) {
      // 主动取消不算失败：清空进度与提示，回到初始状态
      set(error instanceof ImportCancelled ? { status: null } : { status: { key: 'historyImportFailed', error: true } })
    } finally {
      importing = false
      control = null
      set({ busy: false, paused: false, progress: null })
    }
  },
}))
