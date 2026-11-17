import { createId } from '../../utils/id.js'
import { getVisibleMessages } from './branches.js'
import type { AssistantMessage, Message, Session, UserMessage } from './types.js'

/** 一组完整对话：用户提问 + 助手回答；id 取用户消息 id */
export type ForkRound = {
  id: string
  user: UserMessage
  assistant: AssistantMessage
}

/**
 * 取目标助手回复及其之前的完整对话组。
 * 目标必须是当前可见路径上的助手回复；不完整的轮次会被跳过。
 */
export const getForkRounds = (session: Session, targetMessageId: string): ForkRound[] | null => {
  const visible = getVisibleMessages(session)
  const targetIndex = visible.findIndex((message) => message.id === targetMessageId)
  const target = visible[targetIndex]
  if (!target || target.role !== 'assistant') {
    return null
  }
  const rounds: ForkRound[] = []
  for (let index = 0; index + 1 <= targetIndex; index++) {
    const user = visible[index]
    const assistant = visible[index + 1]
    if (user?.role === 'user' && assistant?.role === 'assistant') {
      rounds.push({ id: user.id, user, assistant })
      index++
    }
  }
  return rounds
}

const cloneMessages = (messages: Message[]): Message[] => {
  const ids = messages.map(() => createId())
  return messages.map((message, position) => {
    const clone = structuredClone(message)
    return {
      ...clone,
      id: ids[position] as string,
      parentId: position === 0 ? null : (ids[position - 1] as string),
      selectedChildId: position < ids.length - 1 ? ids[position + 1] : undefined,
    }
  })
}

/**
 * 按勾选的对话组分叉新会话：
 * - 勾选的组按原顺序拼成上下文；
 * - 目标轮次未勾选时，目标回答单独附在最后；
 * - 不复制压缩摘要，原会话保持不变。
 */
export const createForkSession = (
  session: Session,
  targetMessageId: string,
  selectedRoundIds: Iterable<string>,
  titleSuffix = ''
): Session | null => {
  const rounds = getForkRounds(session, targetMessageId)
  if (!rounds) {
    return null
  }
  const visible = getVisibleMessages(session)
  const target = visible.find((message) => message.id === targetMessageId)
  if (!target || target.role !== 'assistant') {
    return null
  }
  const selected = new Set(selectedRoundIds)
  const selectedMessages: Message[] = []
  for (const round of rounds) {
    if (selected.has(round.id)) {
      selectedMessages.push(round.user, round.assistant)
    }
  }
  const targetRound = rounds.find((round) => round.assistant.id === target.id)
  if (!targetRound || !selected.has(targetRound.id)) {
    selectedMessages.push(target)
  }
  if (selectedMessages.length === 0) {
    return null
  }

  const now = Date.now()
  const messages = cloneMessages(selectedMessages)
  const forked: Session = {
    id: createId(),
    title: session.title ? `${session.title}${titleSuffix}` : '',
    createdAt: now,
    updatedAt: now,
    messages,
    rootMessageId: messages[0]?.id ?? null,
  }
  if (session.presetId !== undefined) {
    forked.presetId = session.presetId
  }
  if (session.generation) {
    forked.generation = structuredClone(session.generation)
  }
  if (session.styleProfile) {
    forked.styleProfile = structuredClone(session.styleProfile)
  }
  if (session.identitySource) {
    forked.identitySource = session.identitySource
  }
  return forked
}
