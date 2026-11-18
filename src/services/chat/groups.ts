import { create } from 'zustand'
import { createId } from '../../utils/id.js'
import * as db from './db.js'
import { useChatStore } from './store.js'
import type { SessionGroup } from './types.js'

/** 分组名长度上限，避免侧栏标题过长 */
const MAX_NAME = 30

type SessionGroupState = {
  ready: boolean
  groups: SessionGroup[]
}

export const useSessionGroups = create<SessionGroupState>(() => ({
  ready: false,
  groups: [],
}))

let initTask: Promise<void> | undefined

/** 首次启动加载自定义分组；失败时也标记 ready，不阻塞界面 */
export const initSessionGroups = (): Promise<void> => {
  if (useSessionGroups.getState().ready) {
    return Promise.resolve()
  }
  initTask ??= (async () => {
    try {
      const groups = await db.loadSessionGroups()
      useSessionGroups.setState({
        groups: groups.sort((a, b) => a.createdAt - b.createdAt),
      })
    } catch (error) {
      db.reportStorageError('load session groups')(error)
    } finally {
      useSessionGroups.setState({ ready: true })
      initTask = undefined
    }
  })()
  return initTask
}

export const createSessionGroup = async (name: string): Promise<SessionGroup | null> => {
  const trimmed = name.trim().slice(0, MAX_NAME)
  if (!trimmed) {
    return null
  }
  const group: SessionGroup = { id: createId(), name: trimmed, createdAt: Date.now() }
  try {
    await db.saveSessionGroup(group)
  } catch (error) {
    db.reportStorageError('save session group')(error)
    return null
  }
  useSessionGroups.setState((state) => ({ groups: [...state.groups, group] }))
  return group
}

export const renameSessionGroup = async (id: string, name: string): Promise<boolean> => {
  const trimmed = name.trim().slice(0, MAX_NAME)
  const group = useSessionGroups.getState().groups.find((entry) => entry.id === id)
  if (!trimmed || !group) {
    return false
  }
  const next: SessionGroup = { ...group, name: trimmed }
  try {
    await db.saveSessionGroup(next)
  } catch (error) {
    db.reportStorageError('rename session group')(error)
    return false
  }
  useSessionGroups.setState((state) => ({
    groups: state.groups.map((entry) => (entry.id === id ? next : entry)),
  }))
  return true
}

/** 删除分组；组内会话移出分组但不删除 */
export const removeSessionGroup = async (id: string): Promise<boolean> => {
  try {
    await db.deleteSessionGroup(id)
  } catch (error) {
    db.reportStorageError('delete session group')(error)
    return false
  }
  useSessionGroups.setState((state) => ({
    groups: state.groups.filter((entry) => entry.id !== id),
  }))
  useChatStore.setState((state) => ({
    sessions: state.sessions.map((session) =>
      session.groupId === id ? { ...session, groupId: undefined } : session
    ),
  }))
  return true
}
