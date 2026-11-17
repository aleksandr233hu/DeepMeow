import type { ArchiveSource } from './zipReader.js'
import { fileSource } from './zipReader.js'

/** 已选中待导入的归档：桌面把 File 包装成读取源，Android 用原生直读源。 */
export type ImportPick = {
  name: string
  size: number
  source: ArchiveSource
  /** 原生读取源用完后释放文件描述符 */
  release?: () => void
}

/** 浏览器与桌面：直接用 File 切片读取。 */
export const filePick = (file: File): ImportPick => ({
  name: file.name,
  size: file.size,
  source: fileSource(file),
})
