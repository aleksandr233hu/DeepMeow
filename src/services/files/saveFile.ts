import { Capacitor, registerPlugin } from '@capacitor/core'

/** 原生保存插件，见 android 工程的 FileSavePlugin */
type FileSaveNative = {
  create: (options: { fileName: string; mimeType: string }) => Promise<{ id: string }>
  write: (options: { id: string; data: string }) => Promise<{ bytes: number }>
  close: (options: { id: string }) => Promise<void>
}

const FileSave = registerPlugin<FileSaveNative>('FileSave')

/** 每块 512KB：base64 后约 700KB，避免大文件一次性进内存 */
const CHUNK_SIZE = 512 * 1024

export const supportsNativeSave = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/** 用户在系统「另存为」里点了取消 */
export class SaveCancelled extends Error {
  constructor() {
    super('save canceled')
    this.name = 'SaveCancelled'
  }
}

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const index = result.indexOf(',')
      resolve(index >= 0 ? result.slice(index + 1) : '')
    }
    reader.onerror = () => reject(reader.error ?? new Error('read blob failed'))
    reader.readAsDataURL(blob)
  })

/** 浏览器里沿用原来的 <a download>；返回 false 表示可能没有真正下载 */
const downloadInBrowser = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * 保存 Blob 到用户选择的位置。
 * Android 走系统文件选择器并分块写入；其他环境退回浏览器下载。
 */
export const saveBlob = async ({
  blob,
  fileName,
  mimeType,
  onProgress,
}: {
  blob: Blob
  fileName: string
  mimeType: string
  onProgress?: (ratio: number) => void
}): Promise<'native' | 'browser'> => {
  if (!supportsNativeSave()) {
    downloadInBrowser(blob, fileName)
    return 'browser'
  }
  let id: string
  try {
    id = (await FileSave.create({ fileName, mimeType })).id
  } catch (error) {
    if (String(error).toLowerCase().includes('canceled')) {
      throw new SaveCancelled()
    }
    throw error
  }
  let offset = 0
  try {
    while (offset < blob.size) {
      const chunk = blob.slice(offset, Math.min(offset + CHUNK_SIZE, blob.size))
      await FileSave.write({ id, data: await blobToBase64(chunk) })
      offset += chunk.size
      onProgress?.(Math.min(1, offset / blob.size))
    }
    await FileSave.close({ id })
  } catch (error) {
    try {
      await FileSave.close({ id })
    } catch {
      // 已关闭
    }
    throw error
  }
  return 'native'
}
