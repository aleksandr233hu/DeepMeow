/** 用户主动取消导入时抛出，用于与失败区分：取消不展示为导入错误。 */
export class ImportCancelled extends Error {
  constructor() {
    super('History import cancelled')
    this.name = 'ImportCancelled'
  }
}

/**
 * 导入的暂停 / 取消控制：在条目边界检查。
 * 暂停时挂起读取，继续后从断点往下读；取消后立即抛出 ImportCancelled。
 */
export type ImportControl = {
  pause: () => void
  resume: () => void
  cancel: () => void
  /** 每处理完一个条目调用；暂停时挂起，取消后抛出 */
  checkpoint: () => Promise<void>
}

export const createImportControl = (): ImportControl => {
  let paused = false
  let cancelled = false
  let wake: (() => void) | null = null

  const notify = () => {
    wake?.()
    wake = null
  }

  const check = () => {
    if (cancelled) {
      throw new ImportCancelled()
    }
  }

  return {
    pause: () => {
      paused = true
    },
    resume: () => {
      paused = false
      notify()
    },
    cancel: () => {
      cancelled = true
      paused = false
      notify()
    },
    checkpoint: async () => {
      check()
      while (paused) {
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
      check()
    },
  }
}
