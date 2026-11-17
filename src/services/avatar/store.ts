import { useEffect, useState } from 'react'
import { create } from 'zustand'
import * as db from '../chat/db.js'
import { AvatarError, normalizeAvatar, type AvatarErrorReason } from './normalize.js'
import type { AvatarRole } from './types.js'

type AvatarState = {
  ready: boolean
  avatars: Partial<Record<AvatarRole, Blob>>
}

export const useAvatarStore = create<AvatarState>(() => ({
  ready: false,
  avatars: {},
}))

let initTask: Promise<void> | undefined

/** 首次启动加载自定义头像；失败时也标记 ready，回退默认头像 */
export const initAvatars = (): Promise<void> => {
  if (useAvatarStore.getState().ready) {
    return Promise.resolve()
  }
  initTask ??= (async () => {
    try {
      const records = await db.loadAvatars()
      useAvatarStore.setState({
        avatars: Object.fromEntries(records.map((record) => [record.id, record.blob])),
      })
    } catch (error) {
      db.reportStorageError('load avatars')(error)
    } finally {
      useAvatarStore.setState({ ready: true })
      initTask = undefined
    }
  })()
  return initTask
}

export type SaveAvatarResult = 'done' | AvatarErrorReason | 'failed'

export const saveAvatar = async (
  role: AvatarRole,
  file: File
): Promise<SaveAvatarResult> => {
  try {
    const blob = await normalizeAvatar(file)
    await db.saveAvatar({
      id: role,
      blob,
      mimeType: blob.type,
      updatedAt: Date.now(),
    })
    useAvatarStore.setState((state) => ({
      avatars: { ...state.avatars, [role]: blob },
    }))
    return 'done'
  } catch (error) {
    if (error instanceof AvatarError) {
      return error.reason
    }
    db.reportStorageError('save avatar')(error)
    return 'failed'
  }
}

export const resetAvatar = async (role: AvatarRole): Promise<boolean> => {
  try {
    await db.deleteAvatar(role)
    useAvatarStore.setState((state) => {
      const avatars: Partial<Record<AvatarRole, Blob>> = {}
      if (role !== 'user' && state.avatars.user) {
        avatars.user = state.avatars.user
      }
      if (role !== 'assistant' && state.avatars.assistant) {
        avatars.assistant = state.avatars.assistant
      }
      return { avatars }
    })
    return true
  } catch (error) {
    db.reportStorageError('delete avatar')(error)
    return false
  }
}

/** 组件里使用：Blob 存在时创建 object URL，并在切换/卸载时释放 */
export const useAvatarObjectUrl = (role: AvatarRole): string | null => {
  const blob = useAvatarStore((state) => state.avatars[role])
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [blob])
  return url
}
