import { Capacitor, registerPlugin } from '@capacitor/core'

/** 原生更新插件，见 android 工程的 AppUpdatePlugin。 */
type AppUpdateNative = {
  getVersion: () => Promise<{ versionName: string; versionCode: number }>
  download: (options: { url: string }) => Promise<{ path: string; size: number }>
  install: (options: { path: string }) => Promise<void>
  addListener: (
    eventName: 'progress',
    listener: (data: { loaded: number; total: number }) => void
  ) => Promise<{ remove: () => void }>
}

const AppUpdate = registerPlugin<AppUpdateNative>('AppUpdate')

const RELEASE_API = 'https://api.github.com/repos/aleksandr233hu/DeepMeow/releases/latest'

/** 发现的可用更新 */
export type UpdateInfo = {
  /** 去掉 v 前缀与 -custom 后缀的版本号，例如 1.11.0 */
  version: string
  notes: string
  url: string
  size: number
}

export const supportsInAppUpdate = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

export const readCurrentVersion = async (): Promise<string> => {
  if (!supportsInAppUpdate()) {
    return '0.0.0'
  }
  try {
    return (await AppUpdate.getVersion()).versionName
  } catch {
    return '0.0.0'
  }
}

/** 从 tag 里取出数字版本，例如 v1.11.0-custom → [1, 11, 0] */
const versionParts = (value: string): number[] => {
  const match = /(\d+(?:\.\d+)*)/.exec(value)
  return match ? match[1].split('.').map(Number) : []
}

const isNewer = (latest: number[], current: number[]): boolean => {
  const length = Math.max(latest.length, current.length)
  for (let index = 0; index < length; index += 1) {
    const next = latest[index] ?? 0
    const now = current[index] ?? 0
    if (next !== now) {
      return next > now
    }
  }
  return false
}

type ReleaseAsset = { name?: string; size?: number; browser_download_url?: string }

export type CheckResult =
  | { status: 'update'; info: UpdateInfo }
  | { status: 'latest' }
  | { status: 'error' }

/**
 * 查询 GitHub 最新正式版本。区分「有更新 / 已最新 / 网络失败」，
 * 启动时的静默检查只关心 update，其余情况不打扰用户。
 */
export const checkForUpdate = async (): Promise<CheckResult> => {
  if (!supportsInAppUpdate()) {
    return { status: 'error' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(RELEASE_API, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) {
      return { status: 'error' }
    }
    const release: unknown = await response.json()
    if (typeof release !== 'object' || release === null) {
      return { status: 'error' }
    }
    const tag = typeof (release as { tag_name?: unknown }).tag_name === 'string'
      ? (release as { tag_name: string }).tag_name
      : ''
    const notes = typeof (release as { body?: unknown }).body === 'string'
      ? (release as { body: string }).body
      : ''
    const assets = (release as { assets?: unknown }).assets
    const asset = Array.isArray(assets)
      ? (assets as ReleaseAsset[]).find(
          (item) => typeof item.name === 'string' && item.name.endsWith('.apk')
        )
      : undefined
    if (!tag || !asset?.browser_download_url) {
      return { status: 'error' }
    }
    const current = await readCurrentVersion()
    if (!isNewer(versionParts(tag), versionParts(current))) {
      return { status: 'latest' }
    }
    return {
      status: 'update',
      info: {
        version: tag.replace(/^v/i, '').replace(/-custom$/i, ''),
        notes,
        url: asset.browser_download_url,
        size: typeof asset.size === 'number' ? asset.size : 0,
      },
    }
  } catch {
    return { status: 'error' }
  } finally {
    clearTimeout(timer)
  }
}

/** 下载新 APK 到应用缓存，返回本地路径；通过回调报告字节进度。 */
export const downloadUpdate = async (
  url: string,
  onProgress: (loaded: number, total: number) => void
): Promise<string> => {
  const listener = await AppUpdate.addListener('progress', (data) => {
    onProgress(data.loaded, data.total)
  })
  try {
    const { path } = await AppUpdate.download({ url })
    return path
  } finally {
    await listener.remove()
  }
}

/** 调起系统安装器；同签名覆盖安装，本地数据保留。 */
export const installUpdate = (path: string): Promise<void> => AppUpdate.install({ path })
