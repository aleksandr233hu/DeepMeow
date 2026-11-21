import { Capacitor } from '@capacitor/core'
import { LiveUpdate } from '@capawesome/capacitor-live-update'
import { fetchRemoteText, isNewerVersion } from './update.js'

/**
 * 网页资源热更新：内置资源作为兜底，下载的新包在下次启动生效。
 * 清单放在仓库的 web-bundles 分支，用 raw.githubusercontent.com 提供（github.com 在部分网络不可达）。
 */
const MANIFEST_URL =
  'https://raw.githubusercontent.com/aleksandr233hu/DeepMeow/web-bundles/latest.json'

/** 内置资源的版本号：跟随 APK 版本，序号 0 */
export const BUILTIN_WEB_VERSION = `${__APP_VERSION__}.0`

export type WebBundleManifest = {
  /** 网页包版本，例如 1.10.2.1 */
  version: string
  url: string
  /** 备用下载地址（raw 不可达时再试） */
  urlAlt?: string
  /** SHA-256（十六进制），下载后由原生层校验 */
  checksum: string
  /** 需要的最低 APK 版本；低于它时跳过网页更新 */
  minAppVersion?: string
  notes?: string
}

export type WebCheckResult =
  | { status: 'unsupported' }
  | { status: 'update'; info: WebBundleManifest; current: string }
  | { status: 'pending'; version: string }
  | { status: 'latest'; version: string }
  | { status: 'requiresApp'; version: string; minAppVersion: string }
  | { status: 'error' }

export const supportsLiveUpdate = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/** 当前实际使用的网页版本；内置资源返回 BUILTIN_WEB_VERSION */
export const readWebVersion = async (): Promise<string> => {
  if (!supportsLiveUpdate()) {
    return BUILTIN_WEB_VERSION
  }
  try {
    const { bundleId } = await LiveUpdate.getCurrentBundle()
    return bundleId ?? BUILTIN_WEB_VERSION
  } catch {
    return BUILTIN_WEB_VERSION
  }
}

/** 已下载、等待下次启动生效的版本 */
export const readNextWebVersion = async (): Promise<string | null> => {
  if (!supportsLiveUpdate()) {
    return null
  }
  try {
    const { bundleId } = await LiveUpdate.getNextBundle()
    return bundleId ?? null
  } catch {
    return null
  }
}

const parseManifest = (value: unknown): WebBundleManifest | null => {
  if (typeof value !== 'object' || value === null) {
    return null
  }
  const data = value as Record<string, unknown>
  if (
    typeof data.version !== 'string' ||
    typeof data.url !== 'string' ||
    typeof data.checksum !== 'string' ||
    !/^[a-f0-9]{64}$/i.test(data.checksum)
  ) {
    return null
  }
  return {
    version: data.version,
    url: data.url,
    urlAlt: typeof data.urlAlt === 'string' ? data.urlAlt : undefined,
    checksum: data.checksum.toLowerCase(),
    minAppVersion: typeof data.minAppVersion === 'string' ? data.minAppVersion : undefined,
    notes: typeof data.notes === 'string' ? data.notes : undefined,
  }
}

/** 拉取清单并判断是否需要下载；网络失败返回 error，不打扰用户 */
export const checkWebUpdate = async (): Promise<WebCheckResult> => {
  if (!supportsLiveUpdate()) {
    return { status: 'unsupported' }
  }
  try {
    const text = await fetchRemoteText(MANIFEST_URL)
    if (!text) {
      return { status: 'error' }
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return { status: 'error' }
    }
    const manifest = parseManifest(raw)
    if (!manifest) {
      return { status: 'error' }
    }
    const current = await readWebVersion()
    const next = await readNextWebVersion()
    if (next && next === manifest.version) {
      return { status: 'pending', version: next }
    }
    if (!isNewerVersion(manifest.version, current)) {
      return { status: 'latest', version: current }
    }
    if (manifest.minAppVersion && isNewerVersion(manifest.minAppVersion, __APP_VERSION__)) {
      return {
        status: 'requiresApp',
        version: manifest.version,
        minAppVersion: manifest.minAppVersion,
      }
    }
    return { status: 'update', info: manifest, current }
  } catch {
    return { status: 'error' }
  }
}

/** 下载并设为下次启动生效；raw 失败时换镜像再试一次，校验失败由原生层抛错 */
export const applyWebUpdate = async (info: WebBundleManifest): Promise<void> => {
  const urls = [info.url, info.urlAlt].filter((url): url is string => Boolean(url))
  let lastError: unknown
  for (const url of urls) {
    try {
      await LiveUpdate.downloadBundle({
        url,
        bundleId: info.version,
        checksum: info.checksum,
      })
      await LiveUpdate.setNextBundle({ bundleId: info.version })
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('web bundle download failed')
}

/** 应用可用后调用；返回是否刚从坏包回滚 */
export const markAppReady = async (): Promise<boolean> => {
  if (!supportsLiveUpdate()) {
    return false
  }
  try {
    const result = await LiveUpdate.ready()
    return result.rollback
  } catch {
    return false
  }
}

/** 手动回到内置资源（调试/救援用） */
export const resetWebBundle = async (): Promise<void> => {
  if (!supportsLiveUpdate()) {
    return
  }
  await LiveUpdate.reset()
  await LiveUpdate.reload()
}
