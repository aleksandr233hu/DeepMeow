import { create } from 'zustand'

type ForkDialogState = {
  sessionId: string | null
  messageId: string | null
}

export const useForkDialog = create<ForkDialogState>(() => ({
  sessionId: null,
  messageId: null,
}))

export const openForkDialog = (sessionId: string, messageId: string) =>
  useForkDialog.setState({ sessionId, messageId })

export const closeForkDialog = () =>
  useForkDialog.setState({ sessionId: null, messageId: null })
