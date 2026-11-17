import { Capacitor, registerPlugin } from '@capacitor/core'
import type { ImportPick } from './importSource.js'

/** 原生插件的历史归档读取接口，见 android 工程里的 HistoryFilePlugin。 */
type NativeHistoryFile = {
  pick: () => Promise<{ token: string; name: string; size: number } | null>
  read: (options: {
    token: string
    offset: number
    length: number
  }) => Promise<{ data: string }>
  close: (options: { token: string }) => Promise<void>
}

const HistoryFile = registerPlugin<NativeHistoryFile>('HistoryFile')

/** 只有 Android 原生壳里才走系统选择器直读；网页与桌面继续用 file input。 */
export const supportsNativeArchive = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

const decodeBase64 = (data: string): Uint8Array => {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

/**
 * 用系统选择器选一个 ZIP 并返回可直读的来源；用户取消时返回 null。
 * 原生按偏移读取，不会先把几百 MB 的文件复制到 WebView 缓存。
 */
export const pickNativeArchive = async (): Promise<ImportPick | null> => {
  const picked = await HistoryFile.pick()
  if (!picked) {
    return null
  }
  const token = picked.token
  let released = false
  const release = () => {
    if (released) {
      return
    }
    released = true
    void HistoryFile.close({ token }).catch(() => {})
  }
  return {
    name: picked.name,
    size: picked.size,
    source: {
      size: picked.size,
      read: async (offset, length) => {
        const { data } = await HistoryFile.read({ token, offset, length })
        return decodeBase64(data)
      },
    },
    release,
  }
}
