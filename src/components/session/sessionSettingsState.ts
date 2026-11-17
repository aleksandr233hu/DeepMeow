import { create } from 'zustand'

type SessionSettingsState = {
  /** 当前打开「对话设置」的会话；null 表示关闭 */
  sessionId: string | null
}

export const useSessionSettingsDialog = create<SessionSettingsState>(() => ({
  sessionId: null,
}))

export const openSessionSettings = (sessionId: string) =>
  useSessionSettingsDialog.setState({ sessionId })

export const closeSessionSettings = () => useSessionSettingsDialog.setState({ sessionId: null })
