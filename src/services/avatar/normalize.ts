export type AvatarErrorReason = 'type' | 'size' | 'decode' | 'encode'

export class AvatarError extends Error {
  readonly reason: AvatarErrorReason

  constructor(reason: AvatarErrorReason) {
    super(reason)
    this.name = 'AvatarError'
    this.reason = reason
  }
}

/** 头像文件与输出尺寸上限 */
export const MAX_AVATAR_FILE_BYTES = 10 * 1024 * 1024
export const AVATAR_SIZE = 256

/** 把用户选择的图片居中裁成正方形并缩放到 256×256，输出 JPEG Blob */
export const normalizeAvatar = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith('image/')) {
    throw new AvatarError('type')
  }
  if (file.size > MAX_AVATAR_FILE_BYTES) {
    throw new AvatarError('size')
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new AvatarError('decode')
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const sx = Math.floor((bitmap.width - side) / 2)
    const sy = Math.floor((bitmap.height - side) / 2)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const context = canvas.getContext('2d')
    if (!context) {
      throw new AvatarError('encode')
    }
    // 透明 PNG 转 JPEG 时用白底，避免变成黑块
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.9)
    })
    if (!blob) {
      throw new AvatarError('encode')
    }
    return blob
  } finally {
    bitmap.close()
  }
}
