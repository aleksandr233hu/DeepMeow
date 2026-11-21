import { create } from 'zustand'
import { translate } from '../../i18n/index.js'
import { createId } from '../../utils/id.js'
import { ApiError, streamMessage } from '../api/client.js'
import type { ChatModel, CreateMessageRequest } from '../api/types.js'
import { extractFileIds, getFileErrorCode, isRetryableApiError } from '../api/errors.js'
import { cancelUpload, describeUploadError, uploadAttachment, useUploads } from '../attachments.js'
import { extractMemories } from '../memory/extract.js'
import { recordQuestion } from '../stats/diary.js'
import { enabledMemoryTexts } from '../memory/store.js'
import { resolvePreset } from '../presets/store.js'
import { resolveStyleProfile } from '../style/resolve.js'
import type { StyleProfile } from '../style/types.js'
import { setTemperature, setTopP, useSettings } from '../settings.js'
import {
  appendBranch,
  getVisibleMessages,
  normalizeSession,
  removeMessage,
  removeMessageWithVersions,
  selectVersion,
} from './branches.js'
import * as db from './db.js'
import {
  clearAllDrafts,
  clearDraft,
  clearSentDraft,
  getDraft,
  prepareDraftMessage,
} from './drafts.js'
import { createLatestReminder } from './latestReminder.js'
import {
  CompressionError,
  excludeCovered,
  summarizeSession,
} from './compress.js'
import { clampTemperature, clampTopP, resolveGeneration } from './generation.js'
import { createForkSession } from './fork.js'
import { resolveIdentitySource, type IdentitySource } from './identity.js'
import { buildSystemPrompt } from './systemPrompt.js'
import {
  applyEvent,
  canContinueReply,
  getContextRounds,
  settleReply,
  toRequestMessages,
} from './reply.js'
import {
  toSessionSummary,
  type AssistantMessage,
  type FileAttachment,
  type GenerationSettings,
  type Message,
  type Session,
  type SessionSummary,
  type UserMessage,
} from './types.js'

/** deepseek-flash 同时支持深度思考与图片输入 */
const MODEL: ChatModel = 'deepseek-flash'
/** 保留最近打开的详情；当前会话、生成中及尚未成功保存的会话不淘汰。 */
const SESSION_CACHE_LIMIT = 5
/** 安全审核固定开启，所有请求都走扩展模式 */
const SAFETY_CHECK = { level: 'high' } as const
/** 服务端判定 file_id 失效后，重新补传并重发的最多次数（不含首次请求） */
const FILE_RETRY_LIMIT = 2
/** 退避基数，第 n 次重试等待 2^n 倍；连续失败达到上限就放弃，把原始报错展示出来 */
const FILE_RETRY_BASE_DELAY = 1000

/** 阅读链接始终开启，智能搜索开关控制是否另行声明搜索工具（含边想边搜）。 */
const serverTools = (search: boolean): CreateMessageRequest['tools'] => {
  const tools: CreateMessageRequest['tools'] = [
    { type: 'deepseek_read_url', name: 'deepseek_read_url' },
  ]
  if (search) {
    tools.push({ type: 'deepseek_web_search', name: 'deepseek_web_search' })
  }
  return tools
}

/** 允许自动补标题的请求；手动重命名后取消本轮标题写入，包含主动清空标题的情况。 */
const titleRequests = new Set<AbortController>()

type ChatState = {
  ready: boolean
  initError: boolean
  /** 历史导入或全部删除期间锁定交互，提交成功前仍展示原有记录。 */
  importingHistory: boolean
  /** 仅列表元数据，按 updatedAt 降序；流式消息更新不会改变此数组。 */
  sessions: SessionSummary[]
  sessionCache: Record<string, Session>
  sessionLoadErrors: Record<string, boolean>
  sessionSaveErrors: Record<string, boolean>
  /** null 表示新对话（欢迎页） */
  activeId: string | null
  /** 正在生成回复的会话 */
  streaming: Record<string, AbortController>
}

export const useChatStore = create<ChatState>(() => ({
  ready: false,
  initError: false,
  importingHistory: false,
  sessions: [],
  sessionCache: {},
  sessionLoadErrors: {},
  sessionSaveErrors: {},
  activeId: null,
  streaming: {},
}))

const { getState: get, setState: set } = useChatStore

const sortSessions = (sessions: SessionSummary[]) =>
  [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)

const getSession = (id: string) => {
  const cache = get().sessionCache
  return Object.hasOwn(cache, id) ? cache[id] : undefined
}

const getStreamController = (id: string) => {
  const streams = get().streaming
  return Object.hasOwn(streams, id) ? streams[id] : undefined
}

const sameSummary = (a: SessionSummary, b: SessionSummary) =>
  a.title === b.title && a.createdAt === b.createdAt && a.updatedAt === b.updatedAt

const sessionAccess = new Map<string, number>()
const unsavedSessions = new Set<string>()
/** 保存失败时保留原件，重试成功后才释放。 */
const pendingFiles = new Map<string, db.StoredFile[]>()
const deletingSessions = new Set<string>()
/** 正在后台总结会话的压缩任务，避免重复触发 */
const compressingSessions = new Set<string>()
const deletionTasks = new Set<Promise<boolean>>()
const streamFlushes = new Map<string, () => void>()
let accessSequence = 0
let historyEpoch = 0
let initTask: Promise<void> | undefined
const sessionLoads = new Map<string, { promise: Promise<void> }>()

const touchSession = (id: string) => sessionAccess.set(id, ++accessSequence)

const trimSessionCache = () => {
  const state = get()
  const ids = Object.keys(state.sessionCache)
  if (ids.length <= SESSION_CACHE_LIMIT) {
    return
  }
  const removable = ids
    .filter(
      (id) =>
        id !== state.activeId &&
        !Object.hasOwn(state.streaming, id) &&
        !unsavedSessions.has(id) &&
        !deletingSessions.has(id)
    )
    .sort((a, b) => (sessionAccess.get(a) ?? 0) - (sessionAccess.get(b) ?? 0))
  const evicted = new Set(removable.slice(0, ids.length - SESSION_CACHE_LIMIT))
  for (const id of evicted) {
    sessionAccess.delete(id)
  }
  if (evicted.size > 0) {
    set({
      sessionCache: Object.fromEntries(
        Object.entries(state.sessionCache).filter(([id]) => !evicted.has(id))
      ),
    })
  }
}

const updateSession = (id: string, update: (session: Session) => Session) =>
  set((state) => {
    const previous = Object.hasOwn(state.sessionCache, id) ? state.sessionCache[id] : undefined
    if (!previous) {
      return state
    }
    const session = update(previous)
    if (session === previous) {
      return state
    }
    return {
      sessionCache: { ...state.sessionCache, [id]: session },
      sessions: sameSummary(previous, session)
        ? state.sessions
        : sortSessions(
            state.sessions.map((summary) =>
              summary.id === id ? toSessionSummary(session) : summary
            )
          ),
    }
  })

const updateReply = (sessionId: string, reply: AssistantMessage) =>
  updateSession(sessionId, (session) => ({
    ...session,
    messages: session.messages.map((message) =>
      message.id === reply.id
        ? { ...reply, parentId: message.parentId, selectedChildId: message.selectedChildId }
        : message
    ),
  }))

const persist = (sessionId: string) => {
  const session = getSession(sessionId)
  if (session) {
    unsavedSessions.add(sessionId)
    if (deletingSessions.has(sessionId)) {
      return
    }
    const epoch = historyEpoch
    const files = pendingFiles.get(sessionId)
    void db
      .saveSession(session, files)
      .then(() => {
        if (epoch !== historyEpoch || !getSession(sessionId)) {
          return
        }
        if (pendingFiles.get(sessionId) === files) {
          pendingFiles.delete(sessionId)
        }
        if (getSession(sessionId) === session) {
          unsavedSessions.delete(sessionId)
          set((state) => ({
            sessionSaveErrors: Object.fromEntries(
              Object.entries(state.sessionSaveErrors).filter(([id]) => id !== sessionId)
            ),
          }))
          trimSessionCache()
        }
      })
      .catch((error: unknown) => {
        db.reportStorageError('save session')(error)
        if (epoch === historyEpoch && getSession(sessionId)) {
          set((state) => ({
            sessionSaveErrors: { ...state.sessionSaveErrors, [sessionId]: true },
          }))
        }
      })
  }
}

export const retrySaveSessions = () => {
  if (!get().importingHistory) {
    unsavedSessions.forEach(persist)
  }
}

/** 离开前先合并尚未绘制的增量；隐藏期间浏览器可能暂停动画帧。 */
export const bindChatPersistence = () => {
  const save = () => {
    if (get().importingHistory) {
      return
    }
    for (const [id, flush] of streamFlushes) {
      flush()
      persist(id)
    }
    for (const id of unsavedSessions) {
      if (!streamFlushes.has(id)) {
        persist(id)
      }
    }
  }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      save()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', save)
  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', save)
  }
}

/** 按当前开关创建回复：深度思考对应 thinking，智能搜索控制 deepseek_web_search。 */
const createReply = (): AssistantMessage => {
  const { thinking, search } = useSettings.getState()
  return {
    id: createId(),
    role: 'assistant',
    createdAt: Date.now(),
    model: MODEL,
    thinking,
    search,
    prefix: true,
    status: 'pending',
    blocks: [],
  }
}

/** 仍在生成中的回复（页面关闭或导出时未结束）按「已停止」处理 */
const settleInterrupted = (session: Session): Session => {
  if (
    !session.messages.some(
      (m) => m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming')
    )
  ) {
    return session
  }
  return {
    ...session,
    messages: session.messages.map((m) =>
      m.role === 'assistant' && (m.status === 'pending' || m.status === 'streaming')
        ? settleReply(m, 'stopped', session.updatedAt)
        : m
    ),
  }
}

export const initChat = (): Promise<void> => {
  if (get().ready) {
    return Promise.resolve()
  }
  if (initTask) {
    return initTask
  }
  const epoch = historyEpoch
  set({ initError: false })
  initTask = (async () => {
    try {
      const summaries = await db.loadSessionSummaries()
      if (epoch === historyEpoch) {
        set({ ready: true, sessions: sortSessions(summaries) })
      }
    } catch (error) {
      if (epoch === historyEpoch) {
        set({ initError: true })
        db.reportStorageError('read local sessions')(error)
      }
    } finally {
      if (epoch === historyEpoch) {
        initTask = undefined
      }
    }
  })()
  return initTask
}

/** 同一会话合并并发读取；切换只改变 activeId，旧请求不会把界面切回去。 */
const ensureSessionLoaded = (id: string): Promise<void> => {
  if (getSession(id)) {
    return Promise.resolve()
  }
  const pending = sessionLoads.get(id)
  if (pending) {
    return pending.promise
  }
  const epoch = historyEpoch
  set((state) => ({ sessionLoadErrors: { ...state.sessionLoadErrors, [id]: false } }))
  const load = { promise: Promise.resolve() }
  sessionLoads.set(id, load)
  load.promise = (async () => {
    try {
      const stored = await db.loadSession(id)
      if (epoch !== historyEpoch || sessionLoads.get(id) !== load) {
        return
      }
      const summary = get().sessions.find((session) => session.id === id)
      if (!summary) {
        return
      }
      if (!stored) {
        throw new Error(`Session ${id} is missing from local storage`)
      }
      const settled = settleInterrupted(normalizeSession(stored))
      // 读取期间可能已在列表重命名，保留最新元数据，不能让旧读取覆盖它。
      const session = sameSummary(settled, summary) ? settled : { ...settled, ...summary }
      touchSession(id)
      set((state) => ({ sessionCache: { ...state.sessionCache, [id]: session } }))
      if (session !== stored) {
        persist(id)
      }
      trimSessionCache()
    } catch (error) {
      if (epoch === historyEpoch && sessionLoads.get(id) === load) {
        set((state) => ({ sessionLoadErrors: { ...state.sessionLoadErrors, [id]: true } }))
        db.reportStorageError('read session')(error)
      }
    } finally {
      if (sessionLoads.get(id) === load) {
        sessionLoads.delete(id)
      }
    }
  })()
  return load.promise
}

/** 等所有回复的收尾（落盘）完成 */
const waitForIdle = (sessionId?: string) =>
  new Promise<void>((resolve) => {
    const isIdle = (state: ChatState) =>
      sessionId === undefined
        ? Object.keys(state.streaming).length === 0
        : !Object.hasOwn(state.streaming, sessionId)
    if (isIdle(get())) {
      resolve()
      return
    }
    const unsubscribe = useChatStore.subscribe((state) => {
      if (isIdle(state)) {
        unsubscribe()
        resolve()
      }
    })
  })

/**
 * 替换历史对话：先写入暂存，成功后原子替换旧记录；写入为空即删除全部会话与附件。
 * 期间停止生成并禁止修改会话；失败时清除暂存，保留原有记录。
 */
export const replaceHistory = async (write: () => Promise<void>): Promise<number> => {
  if (get().importingHistory) {
    throw new Error('History replacement is already in progress')
  }
  set({ importingHistory: true })
  try {
    for (const controller of Object.values(get().streaming)) {
      controller.abort()
    }
    // 已开始的单条删除先同步到内存，避免本次替换失败后列表残留已被删除的记录。
    await Promise.all(deletionTasks)
    historyEpoch += 1
    initTask = undefined
    sessionLoads.clear()
    await waitForIdle()
    await db.clearStaging()
    let summaries: SessionSummary[]
    try {
      await write()
      summaries = await db.commitStaging()
    } catch (error) {
      await db.clearStaging().catch(db.reportStorageError('clear unfinished history replacement'))
      throw error
    }
    sessionAccess.clear()
    unsavedSessions.clear()
    pendingFiles.clear()
    clearAllDrafts()
    set({
      ready: true,
      initError: false,
      sessions: sortSessions(summaries),
      sessionCache: {},
      sessionLoadErrors: {},
      sessionSaveErrors: {},
      activeId: null,
    })
    return summaries.length
  } finally {
    set({ importingHistory: false })
    retrySaveSessions()
    const { activeId, ready } = get()
    // 替换失败时恢复被取消的详情读取，原有记录继续可用。
    if (activeId !== null) {
      void ensureSessionLoaded(activeId)
    } else if (!ready) {
      void initChat()
    }
  }
}

/**
 * 确认导入后调用：写入暂存并合并进现有数据，已有会话和正在生成的回答都不受影响。
 * 同 ID 的会话跳过；返回导入与跳过的数量，失败时不改动正式数据。
 */
export const mergeHistory = async (
  write: () => Promise<void>
): Promise<{ imported: number; skipped: number }> => {
  if (get().importingHistory) {
    throw new Error('History import is already in progress')
  }
  set({ importingHistory: true })
  try {
    // 首次载入未完成时先等列表就绪，否则初始化的结果会覆盖合并后的列表。
    await initChat()
    await db.clearStaging()
    try {
      await write()
    } catch (error) {
      await db.clearStaging().catch(db.reportStorageError('clear unfinished history merge'))
      throw error
    }
    const { summaries, imported, skipped } = await db.commitStagingMerge()
    // 只在本次导入成功后才更新列表，原有会话的顺序与内容保持不变。
    set({ sessions: sortSessions([...get().sessions, ...summaries]) })
    return { imported, skipped }
  } finally {
    set({ importingHistory: false })
    retrySaveSessions()
  }
}

export const newChat = () => {
  if (!get().importingHistory) {
    set({ activeId: null })
    trimSessionCache()
  }
}

export const selectSession = (id: string) => {
  if (!get().importingHistory && get().sessions.some((session) => session.id === id)) {
    touchSession(id)
    set({ activeId: id })
    void ensureSessionLoaded(id)
    trimSessionCache()
  }
}

export const renameSession = (id: string, title: string) => {
  if (get().importingHistory || deletingSessions.has(id)) {
    return
  }
  const controller = getStreamController(id)
  if (controller) {
    titleRequests.delete(controller)
  }
  if (getSession(id)) {
    updateSession(id, (session) => ({ ...session, title }))
    persist(id)
  } else {
    set((state) => ({
      sessions: state.sessions.map((session) =>
        session.id === id ? { ...session, title } : session
      ),
    }))
    void db.renameSession(id, title).catch(db.reportStorageError('rename session'))
  }
}

/** 侧栏置顶：只影响列表分组，不改变会话内容与顺序依据。 */
export const setSessionPinned = (id: string, pinned: boolean) => {
  if (get().importingHistory || deletingSessions.has(id)) {
    return
  }
  // 侧栏读摘要列表，无论会话是否已加载都先更新这一层
  set((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === id ? { ...session, pinned } : session
    ),
  }))
  if (getSession(id)) {
    updateSession(id, (session) => ({ ...session, pinned }))
    persist(id)
  }
  void db.setSessionPinned(id, pinned).catch(db.reportStorageError('pin session'))
}

/** 会话归属自定义分组；null 表示移出分组。 */
export const setSessionGroup = (id: string, groupId: string | null) => {
  if (get().importingHistory || deletingSessions.has(id)) {
    return
  }
  set((state) => ({
    sessions: state.sessions.map((session) =>
      session.id === id ? { ...session, groupId: groupId ?? undefined } : session
    ),
  }))
  if (getSession(id)) {
    updateSession(id, (session) => ({ ...session, groupId: groupId ?? undefined }))
    persist(id)
  }
  void db.setSessionGroup(id, groupId).catch(db.reportStorageError('move session to group'))
}

/** 批量置顶：摘要层一次更新，逐条走单条写入路径持久化。 */
export const setSessionsPinned = (ids: readonly string[], pinned: boolean) => {
  if (get().importingHistory) {
    return
  }
  const targets = ids.filter((id) => !deletingSessions.has(id))
  if (targets.length === 0) {
    return
  }
  const target = new Set(targets)
  set((state) => ({
    sessions: state.sessions.map((session) =>
      target.has(session.id) ? { ...session, pinned } : session
    ),
  }))
  for (const id of targets) {
    if (getSession(id)) {
      updateSession(id, (session) => ({ ...session, pinned }))
      persist(id)
    }
    void db.setSessionPinned(id, pinned).catch(db.reportStorageError('pin session'))
  }
}

/** 批量移动到分组；groupId 为 null 表示移出分组。 */
export const setSessionsGroup = (ids: readonly string[], groupId: string | null) => {
  if (get().importingHistory) {
    return
  }
  const targets = ids.filter((id) => !deletingSessions.has(id))
  if (targets.length === 0) {
    return
  }
  const target = new Set(targets)
  set((state) => ({
    sessions: state.sessions.map((session) =>
      target.has(session.id) ? { ...session, groupId: groupId ?? undefined } : session
    ),
  }))
  for (const id of targets) {
    if (getSession(id)) {
      updateSession(id, (session) => ({ ...session, groupId: groupId ?? undefined }))
      persist(id)
    }
    void db.setSessionGroup(id, groupId).catch(db.reportStorageError('move session to group'))
  }
}

/**
 * 删除会话；本地原件仅在没有其他会话引用时清理。远端文件不删：导入、编辑、重新生成都会复用同一个附件，
 * 同一服务端文件可能被多个会话引用，不维护引用计数。
 */
export const removeSession = (id: string): Promise<boolean> => {
  const task = removeSessionData(id).finally(() => deletionTasks.delete(task))
  deletionTasks.add(task)
  return task
}

const removeSessionData = async (id: string): Promise<boolean> => {
  if (get().importingHistory || deletingSessions.has(id)) {
    return false
  }
  const epoch = historyEpoch
  deletingSessions.add(id)
  try {
    getStreamController(id)?.abort()
    // 等本会话的流收尾，避免删除之后又被收尾保存写回来。
    await waitForIdle(id)
    if (epoch !== historyEpoch) {
      return false
    }
    await db.deleteSession(id)
    if (epoch !== historyEpoch) {
      return true
    }
    sessionLoads.delete(id)
    sessionAccess.delete(id)
    unsavedSessions.delete(id)
    pendingFiles.delete(id)
    clearDraft(id)
    set((state) => ({
      sessions: state.sessions.filter((session) => session.id !== id),
      sessionCache: Object.fromEntries(
        Object.entries(state.sessionCache).filter(([key]) => key !== id)
      ),
      sessionLoadErrors: Object.fromEntries(
        Object.entries(state.sessionLoadErrors).filter(([key]) => key !== id)
      ),
      sessionSaveErrors: Object.fromEntries(
        Object.entries(state.sessionSaveErrors).filter(([key]) => key !== id)
      ),
      activeId: state.activeId === id ? null : state.activeId,
    }))
    return true
  } catch (error) {
    db.reportStorageError('delete session')(error)
    return false
  } finally {
    deletingSessions.delete(id)
    // 删除失败时保留会话，并保存停止生成后的最新状态。
    if (getSession(id)) {
      if (get().importingHistory) {
        unsavedSessions.add(id)
      } else {
        persist(id)
      }
    }
  }
}

export const stopReply = (sessionId: string) => getStreamController(sessionId)?.abort()

/**
 * 提交指定会话的最新草稿；null 表示新建会话。
 * 同步接收成功才清空草稿，附件原件由会话接管；保存失败仍通过保存入口重试。
 */
export const sendMessage = (targetSessionId: string | null) => {
  if (get().importingHistory || !get().ready) {
    return false
  }
  const prepared = prepareDraftMessage(getDraft(targetSessionId), useUploads.getState().tasks)
  if (!prepared) {
    return false
  }
  const { text, files } = prepared
  const now = Date.now()
  let sessionId = targetSessionId
  if (
    sessionId !== null &&
    (deletingSessions.has(sessionId) || getStreamController(sessionId) || !getSession(sessionId))
  ) {
    return false
  }
  if (sessionId === null) {
    const session: Session = {
      id: createId(),
      title: '',
      createdAt: now,
      updatedAt: now,
      messages: [],
      rootMessageId: null,
    }
    sessionId = session.id
    touchSession(session.id)
    set((state) => ({
      sessions: [toSessionSummary(session), ...state.sessions],
      sessionCache: { ...state.sessionCache, [session.id]: session },
      activeId: session.id,
    }))
  }
  const current = getSession(sessionId)
  if (!current) {
    return false
  }
  const history = getVisibleMessages(current)
  const question: UserMessage = {
    id: createId(),
    role: 'user',
    content: text,
    files: files.map(({ id, serverId, name, size, isImage, mimeType }) => ({
      id,
      serverId,
      name,
      size,
      isImage,
      mimeType,
    })),
    createdAt: now,
  }
  const reply = createReply()
  updateSession(sessionId, (session) => ({
    ...appendBranch(session, history.at(-1)?.id ?? null, [question, reply]),
    updatedAt: now,
  }))
  recordQuestion(now)
  if (files.length > 0) {
    pendingFiles.set(sessionId, [
      ...(pendingFiles.get(sessionId) ?? []),
      ...files.map(({ id, blob }) => ({ id, blob })),
    ])
  }
  persist(sessionId)
  clearSentDraft(targetSessionId)
  void streamReply(sessionId, reply, { history, question })
  return true
}

/** 重新生成当前路径上的回答：在原问题下新增版本，不覆盖旧回答和后续对话。 */
export const regenerateReply = (sessionId: string, messageId?: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const index =
    messageId === undefined ? path.length - 1 : path.findIndex((m) => m.id === messageId)
  const question = path[index - 1]
  if (question?.role !== 'user' || path[index]?.role !== 'assistant') {
    return
  }
  const history = path.slice(0, index - 1)
  const reply = createReply()
  updateSession(sessionId, (s) => ({
    ...appendBranch(s, question.id, [reply]),
    updatedAt: Date.now(),
  }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history, question })
}

/** 编辑提问后新增同父版本，保留原文件；旧问题的所有回答与后续对话仍可切回。 */
export const editMessage = (sessionId: string, messageId: string, content: string): boolean => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return false
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return false
  }
  const path = getVisibleMessages(session)
  const index = path.findIndex((message) => message.id === messageId)
  const previous = path[index]
  const text = content.trim()
  if (previous?.role !== 'user' || (!text && previous.files.length === 0)) {
    return false
  }
  const question: UserMessage = {
    id: createId(),
    role: 'user',
    content: text,
    files: previous.files,
    createdAt: Date.now(),
  }
  const reply = createReply()
  updateSession(sessionId, (s) => ({
    ...appendBranch(s, path[index - 1]?.id ?? null, [question, reply]),
    updatedAt: Date.now(),
  }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, index), question })
  return true
}

export const selectMessageVersion = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  if (getStreamController(sessionId)) {
    return
  }
  updateSession(sessionId, (session) => selectVersion(session, messageId))
  persist(sessionId)
}

/** 切换本会话的人格预设；只影响之后的请求，不重新生成历史回答 */
export const setSessionPreset = (sessionId: string, presetId: string | null) => {
  if (get().importingHistory || deletingSessions.has(sessionId) || getStreamController(sessionId)) {
    return
  }
  if (!getSession(sessionId)) {
    return
  }
  updateSession(sessionId, (session) => ({
    ...session,
    presetId: presetId ?? undefined,
    updatedAt: Date.now(),
  }))
  persist(sessionId)
}

/** 记录自动提取长期记忆的游标；undefined 表示清空重来 */
export const setSessionMemoryCursor = (sessionId: string, cursor: Session['memoryCursor']) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  if (!getSession(sessionId)) {
    return
  }
  updateSession(sessionId, (session) => ({ ...session, memoryCursor: cursor }))
  persist(sessionId)
}

/** 读取任意会话正文（不切换当前会话），供总结记忆等后台任务使用 */
export const loadSessionForTask = async (id: string): Promise<Session | null> => {
  await ensureSessionLoaded(id)
  return getSession(id) ?? null
}

/**
 * 从某条助手回复分叉出新会话：复制它及其之前的可见路径，原会话保持不变。
 * 返回新会话 id；消息不可见、不是助手回复或正在生成时返回 null。
 */
export const forkSessionFromMessage = (
  sessionId: string,
  messageId: string,
  selectedRoundIds: string[]
): string | null => {
  if (get().importingHistory || deletingSessions.has(sessionId) || getStreamController(sessionId)) {
    return null
  }
  const session = getSession(sessionId)
  if (!session) {
    return null
  }
  const forked = createForkSession(
    session,
    messageId,
    selectedRoundIds,
    translate('branchTitleSuffix')
  )
  if (!forked) {
    return null
  }
  const pending = pendingFiles.get(sessionId)
  if (pending) {
    pendingFiles.set(forked.id, [...pending])
  }
  touchSession(forked.id)
  set((state) => ({
    sessions: sortSessions([toSessionSummary(forked), ...state.sessions]),
    sessionCache: { ...state.sessionCache, [forked.id]: forked },
    activeId: forked.id,
  }))
  persist(forked.id)
  trimSessionCache()
  return forked.id
}

/** 保存会话级生成参数；传入 null 或空对象表示全部跟随全局 */
export const setSessionGeneration = (
  sessionId: string,
  generation: GenerationSettings | null,
  styleProfile?: StyleProfile | null,
  identitySource?: IdentitySource | null
): boolean => {
  if (get().importingHistory || deletingSessions.has(sessionId) || getStreamController(sessionId)) {
    return false
  }
  if (!getSession(sessionId)) {
    return false
  }
  const next: GenerationSettings = {}
  const temperature = clampTemperature(generation?.temperature ?? null)
  const topP = clampTopP(generation?.topP ?? null)
  if (temperature !== null) {
    next.temperature = temperature
  }
  if (topP !== null) {
    next.topP = topP
  }
  if (generation?.systemPrompt !== undefined) {
    next.systemPrompt = generation.systemPrompt
  }
  updateSession(sessionId, (session) => {
    const updated = { ...session, updatedAt: Date.now() }
    if (Object.keys(next).length === 0) {
      delete updated.generation
    } else {
      updated.generation = next
    }
    if (styleProfile !== undefined) {
      if (styleProfile === null) {
        delete updated.styleProfile
      } else {
        updated.styleProfile = styleProfile
      }
    }
    if (identitySource !== undefined) {
      if (identitySource === null) {
        delete updated.identitySource
      } else {
        updated.identitySource = identitySource
      }
    }
    return updated
  })
  persist(sessionId)
  return true
}

export type ApplyGenerationResult = 'done' | 'busy' | 'failed'

/**
 * 把当前会话生效的温度 / top_p 写成全局默认，并清除所有会话的这两项覆盖。
 * 系统提示词覆盖保持不变。
 */
export const applyGenerationToAll = async (
  sessionId: string
): Promise<ApplyGenerationResult> => {
  if (
    get().importingHistory ||
    deletingSessions.has(sessionId) ||
    Object.keys(get().streaming).length > 0
  ) {
    return 'busy'
  }
  const session = getSession(sessionId)
  if (!session) {
    return 'failed'
  }
  const effective = resolveGeneration(session, useSettings.getState())
  setTemperature(effective.temperature)
  setTopP(effective.topP)

  try {
    for (const summary of get().sessions) {
      const current = getSession(summary.id) ?? (await db.loadSession(summary.id))
      if (!current?.generation) {
        continue
      }
      if (
        current.generation.temperature === undefined &&
        current.generation.topP === undefined
      ) {
        continue
      }
      const nextGeneration: GenerationSettings = {}
      if (current.generation.systemPrompt !== undefined) {
        nextGeneration.systemPrompt = current.generation.systemPrompt
      }
      const next: Session = { ...current }
      if (Object.keys(nextGeneration).length === 0) {
        delete next.generation
      } else {
        next.generation = nextGeneration
      }
      await db.saveSession(next)
      if (getSession(summary.id)) {
        set((state) => ({
          sessionCache: { ...state.sessionCache, [summary.id]: next },
        }))
      }
    }
    return 'done'
  } catch (error) {
    db.reportStorageError('apply generation defaults')(error)
    return 'failed'
  }
}

/**
 * 删除当前路径上的一条消息：子分支接回父节点，其余版本与后续对话保留。
 * 返回撤销函数；会话不存在、正在生成或消息不可见时返回 null。
 */
export const deleteMessage = (
  sessionId: string,
  messageId: string,
  options?: { includeVersions?: boolean }
): (() => void) | null => {
  if (get().importingHistory || deletingSessions.has(sessionId) || getStreamController(sessionId)) {
    return null
  }
  const session = getSession(sessionId)
  if (!session || !getVisibleMessages(session).some((message) => message.id === messageId)) {
    return null
  }
  const snapshot = session
  updateSession(sessionId, (current) => {
    const next = options?.includeVersions
      ? removeMessageWithVersions(current, messageId)
      : removeMessage(current, messageId)
    return next === current ? current : { ...next, updatedAt: Date.now() }
  })
  const updated = getSession(sessionId)
  if (!updated || updated === snapshot) {
    return null
  }
  persist(sessionId)
  return () => {
    if (!getSession(sessionId) || getStreamController(sessionId)) {
      return
    }
    updateSession(sessionId, (current) => ({
      ...snapshot,
      title: current.title,
      updatedAt: Date.now(),
    }))
    persist(sessionId)
  }
}

/**
 * 就地编辑模型回复：用一段新文本替换正文块，保留思考与工具块；改后内容进入后续上下文。
 * 只允许编辑已完成或已停止的回复，不触发重新生成。
 */
export const editAssistantReply = (
  sessionId: string,
  messageId: string,
  content: string
): boolean => {
  if (get().importingHistory || deletingSessions.has(sessionId) || getStreamController(sessionId)) {
    return false
  }
  const session = getSession(sessionId)
  if (!session) {
    return false
  }
  const message = getVisibleMessages(session).find((item) => item.id === messageId)
  const text = content.trim()
  if (
    message?.role !== 'assistant' ||
    message.stopReason === 'refusal' ||
    (message.status !== 'done' && message.status !== 'stopped') ||
    !text
  ) {
    return false
  }
  const editedAt = Date.now()
  updateSession(sessionId, (current) => ({
    ...current,
    updatedAt: editedAt,
    messages: current.messages.map((item) =>
      item.id === messageId && item.role === 'assistant'
        ? {
            ...item,
            blocks: [
              ...item.blocks.filter((block) => block.type !== 'text'),
              { type: 'text', text },
            ],
            editedAt,
          }
        : item
    ),
  }))
  persist(sessionId)
  return true
}

export type CompressResult = 'done' | 'tooShort' | 'failed' | 'busy'

/**
 * 手动压缩较早对话：保留最近三轮，其余交给模型总结后替换进系统提示词。
 * 不改动消息本身，恢复时只清除 compression。
 */
export const compressSession = async (sessionId: string): Promise<CompressResult> => {
  if (
    get().importingHistory ||
    deletingSessions.has(sessionId) ||
    getStreamController(sessionId) ||
    compressingSessions.has(sessionId)
  ) {
    return 'busy'
  }
  const session = getSession(sessionId)
  const apiKey = useSettings.getState().apiKey
  if (!session || !apiKey) {
    return 'failed'
  }
  compressingSessions.add(sessionId)
  try {
    const compression = await summarizeSession({
      session,
      apiKey,
      signal: new AbortController().signal,
    })
    if (!getSession(sessionId)) {
      return 'failed'
    }
    updateSession(sessionId, (current) => ({ ...current, compression, updatedAt: Date.now() }))
    persist(sessionId)
    return 'done'
  } catch (error) {
    return error instanceof CompressionError && error.reason === 'tooShort'
      ? 'tooShort'
      : 'failed'
  } finally {
    compressingSessions.delete(sessionId)
  }
}

/** 恢复压缩前的原文：只清除摘要，消息从未被删除 */
export const restoreCompression = (sessionId: string): boolean => {
  if (get().importingHistory || deletingSessions.has(sessionId) || getStreamController(sessionId)) {
    return false
  }
  const session = getSession(sessionId)
  if (!session?.compression) {
    return false
  }
  updateSession(sessionId, (current) => {
    const next = { ...current, updatedAt: Date.now() }
    delete next.compression
    return next
  })
  persist(sessionId)
  return true
}

/** 继续最后一条未完成的回答：保留原消息与开关，仅将新流的内容追加到原块之后。 */
export const continueReply = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const question = path.at(-2)
  const previous = path.at(-1)
  if (
    question?.role !== 'user' ||
    previous?.role !== 'assistant' ||
    previous.id !== messageId ||
    !canContinueReply(previous)
  ) {
    return
  }
  const { thinking, search } = useSettings.getState()
  const reply: AssistantMessage = {
    ...previous,
    // 未记录请求配置的回复，续写时使用默认模型和当前开关。
    model: previous.model ?? MODEL,
    thinking: previous.thinking ?? thinking,
    search: previous.search ?? search,
    status: 'pending',
    stopReason: undefined,
    stopDetails: undefined,
    error: undefined,
  }
  updateReply(sessionId, reply)
  updateSession(sessionId, (s) => ({ ...s, updatedAt: Date.now() }))
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, -2), question, prefix: previous })
}

/** 附件补传失败后重试：保留原回答位置，重新补传并请求 */
export const retryUpload = (sessionId: string, messageId: string) => {
  if (get().importingHistory || deletingSessions.has(sessionId)) {
    return
  }
  const session = getSession(sessionId)
  if (!session || getStreamController(sessionId)) {
    return
  }
  const path = getVisibleMessages(session)
  const index = path.findIndex((message) => message.id === messageId)
  const question = path[index - 1]
  const previous = path[index]
  if (
    question?.role !== 'user' ||
    previous?.role !== 'assistant' ||
    previous.error?.kind !== 'upload'
  ) {
    return
  }
  const reply: AssistantMessage = { ...previous, status: 'pending', error: undefined }
  updateReply(sessionId, reply)
  persist(sessionId)
  void streamReply(sessionId, reply, { history: path.slice(0, index - 1), question })
}

type Request = { history: Message[]; question: UserMessage; prefix?: AssistantMessage }

/** 把补传得到的 serverId 写回会话里所有引用同一附件的消息（编辑、重新生成会共用附件） */
const saveServerIds = (sessionId: string, serverIds: Map<string, string>) => {
  if (serverIds.size === 0) {
    return
  }
  updateSession(sessionId, (session) => ({
    ...session,
    messages: session.messages.map((message) =>
      message.role === 'user' && message.files.some((file) => serverIds.has(file.id))
        ? {
            ...message,
            files: message.files.map((file) =>
              serverIds.has(file.id) ? { ...file, serverId: serverIds.get(file.id) ?? null } : file
            ),
          }
        : message
    ),
  }))
  persist(sessionId)
}

/**
 * 附件的服务端 id：已有直接用；正在上传的等待同一任务；否则读取本地原件补传。
 * 本地也没有原件（导入的文档附件只有元数据）时返回 null，该附件只展示、不进入请求。
 */
const ensureServerId = async (apiKey: string, file: FileAttachment): Promise<string | null> => {
  if (file.serverId) {
    return file.serverId
  }
  const task = useUploads.getState().tasks[file.id]
  if (task?.status === 'done') {
    return task.serverId
  }
  const blob = await db.loadFile(file.id)
  if (!blob) {
    return null
  }
  return uploadAttachment(apiKey, file.id, blob, file.name, file.isImage)
}

/** 用会话里的最新消息替换请求快照：重传前会重置附件的 serverId，快照必须跟着更新 */
const refreshRequest = (sessionId: string, request: Request): Request => {
  const session = getSession(sessionId)
  if (!session) {
    return request
  }
  const byId = new Map(session.messages.map((message) => [message.id, message]))
  const pick = <T extends Message>(message: T): T =>
    (byId.get(message.id) as T | undefined) ?? message
  return {
    history: request.history.map(pick),
    question: pick(request.question),
    prefix: request.prefix,
  }
}

/**
 * 发送前补齐附件的 serverId。
 * - 本轮提问的附件并行补齐，任一失败则整体失败，已成功的照常写回，重试时复用成功结果；
 * - 历史轮次（仅进入上下文的）中没有 serverId 的附件，多为导入的图片：从最新的消息往前逐张补传，
 *   失败静默跳过，该附件不进入本次请求，下次发送时再试。
 */
const prepareFiles = async (sessionId: string, request: Request, signal: AbortSignal) => {
  const epoch = historyEpoch
  // 服务端判定 file_id 失效时会清掉会话里的 serverId，先用最新消息替换请求快照，
  // 否则快照里仍是旧 id，补传会直接复用它。
  request = refreshRequest(sessionId, request)
  const apiKey = useSettings.getState().apiKey ?? ''
  const serverIds = new Map<string, string>()
  // 停止生成立即生效；上传本身不取消（输入框与其他消息可能共用同一任务），完成后照常写回 serverId
  const aborted = new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
  const uploads = Promise.allSettled(
    request.question.files.map(async (file) => {
      const serverId = await ensureServerId(apiKey, file)
      if (serverId) {
        serverIds.set(file.id, serverId)
      }
    })
  )
  void uploads.then(() => {
    if (epoch === historyEpoch) {
      saveServerIds(sessionId, serverIds)
    }
  })
  const results = await Promise.race([uploads, aborted])
  const failed = results.find((result) => result.status === 'rejected')
  if (failed) {
    throw failed.reason
  }

  const pending = new Map<string, FileAttachment>()
  for (const [user] of getContextRounds(request.history).toReversed()) {
    for (const file of user.files) {
      if (!file.serverId && !serverIds.has(file.id) && !pending.has(file.id)) {
        pending.set(file.id, file)
      }
    }
  }
  for (const file of pending.values()) {
    signal.throwIfAborted()
    try {
      const serverId = await Promise.race([ensureServerId(apiKey, file), aborted])
      if (serverId) {
        serverIds.set(file.id, serverId)
        saveServerIds(sessionId, new Map([[file.id, serverId]]))
      }
    } catch {
      signal.throwIfAborted()
    }
  }

  // 用补齐后的会话重新取历史与提问，保证请求里都是 serverId
  const session = getSession(sessionId)
  const resolve = <T extends Message>(message: T): T =>
    (session?.messages.find((m) => m.id === message.id) as T | undefined) ?? message
  return {
    history: request.history.map(resolve),
    question: resolve(request.question),
    prefix: request.prefix,
  }
}

/** 本次请求实际会用到的服务端 file_id */
const collectServerFileIds = (request: Request): Set<string> => {
  const ids = new Set<string>()
  const add = (files: FileAttachment[]) => {
    for (const file of files) {
      if (file.serverId) {
        ids.add(file.serverId)
      }
    }
  }
  add(request.question.files)
  for (const [user] of getContextRounds(request.history)) {
    add(user.files)
  }
  return ids
}

/**
 * 服务端判定 file_id 失效时，清掉对应附件的 serverId 并丢弃旧的上传任务，
 * 下一次补齐会重新读取本地原件上传。报错里点名了 file_id 就只重置这些，
 * 没点名（如 invalid file_id）则重置本次请求用到的全部附件。
 */
const reuploadInvalidatedFiles = (sessionId: string, request: Request, error: unknown): boolean => {
  if (!(error instanceof ApiError) || !getFileErrorCode(error)) {
    return false
  }
  const mentioned = extractFileIds(error.message)
  // 重试时原始快照里还是上一轮已被清掉的 serverId，先换成会话里的最新消息
  const targets =
    mentioned.length > 0
      ? new Set(mentioned)
      : collectServerFileIds(refreshRequest(sessionId, request))
  const session = getSession(sessionId)
  if (targets.size === 0 || !session) {
    return false
  }
  const localIds: string[] = []
  const messages = session.messages.map((message) => {
    if (message.role !== 'user') {
      return message
    }
    let changed = false
    const files = message.files.map((file) => {
      if (!file.serverId || !targets.has(file.serverId)) {
        return file
      }
      localIds.push(file.id)
      changed = true
      return { ...file, serverId: null }
    })
    return changed ? { ...message, files } : message
  })
  if (localIds.length === 0) {
    return false
  }
  updateSession(sessionId, (current) => ({ ...current, messages }))
  // 上传任务里可能还留着同一个失效的 serverId，清掉后 ensureServerId 才会重新上传
  localIds.forEach(cancelUpload)
  persist(sessionId)
  return true
}

/** 重传前的退避等待；停止生成时立即返回，由调用方按已停止收尾 */
const waitForRetry = (attempt: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    function onAbort() {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(
      () => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      },
      FILE_RETRY_BASE_DELAY * 2 ** attempt
    )
    signal.addEventListener('abort', onAbort, { once: true })
  })

/**
 * 请求并消费流：先补齐附件的 serverId，再发请求；流式增量按动画帧刷新内存，完成、失败或停止后落盘。
 * 补传失败时回复记为 upload 错误，可重试。
 * 服务端判定 file_id 失效时重新补传后重发，退避重试且次数有上限，超过则按原始报错收尾。
 */
const streamReply = async (sessionId: string, initial: AssistantMessage, request: Request) => {
  const controller = new AbortController()
  const settings = useSettings.getState()
  const initialSession = getSession(sessionId)
  const compression = initialSession?.compression
  const generation = resolveGeneration(initialSession, settings)
  const styleProfile = resolveStyleProfile(initialSession, settings.styleProfile)
  const identitySource = resolveIdentitySource(initialSession, settings.identitySource)
  const activeRequest = compression
    ? { ...request, history: excludeCovered(compression, request.history) }
    : request
  if (!getSession(sessionId)?.title) {
    titleRequests.add(controller)
  }
  set((state) => ({ streaming: { ...state.streaming, [sessionId]: controller } }))
  let reply = initial
  let frame = 0
  const flush = () => {
    cancelAnimationFrame(frame)
    frame = 0
    updateReply(sessionId, reply)
  }
  streamFlushes.set(sessionId, flush)

  try {
    for (let attempt = 0; ; attempt += 1) {
      /** 附件补齐前出错属于上传失败，请求还没有发出 */
      let preparing = true
      let receivedContent = false
      try {
        const prepared = await prepareFiles(sessionId, activeRequest, controller.signal)
        preparing = false
        // 附件就绪后获取本轮信息；续写沿用原回答快照，重新生成的快照独立保存。
        const latestReminder = prepared.prefix
          ? prepared.prefix.latestReminder
          : createLatestReminder(useSettings.getState())
        reply = { ...reply, latestReminder }
        updateReply(sessionId, reply)
        persist(sessionId)
        const messages = toRequestMessages(
          prepared.history,
          prepared.question,
          prepared.prefix,
          initial.thinking ?? false,
          latestReminder
        )
        const events = streamMessage(
          useSettings.getState().apiKey ?? '',
          {
            model: initial.model ?? MODEL,
            system: buildSystemPrompt({
              compression,
              agentInstructions:
                identitySource === 'agent' ? generation.agentInstructions : '',
              preset:
                identitySource === 'persona'
                  ? resolvePreset(getSession(sessionId)?.presetId)
                  : undefined,
              nickname: settings.nickname,
              occupation: settings.occupation,
              aboutMe: settings.aboutMe,
              responseStyle: settings.responseStyle,
              styleProfile,
              memories: settings.memoryEnabled ? enabledMemoryTexts() : [],
            }),
            messages,
            thinking: { type: initial.thinking ? 'enabled' : 'disabled' },
            ...(generation.temperature !== null ? { temperature: generation.temperature } : {}),
            ...(generation.topP !== null ? { top_p: generation.topP } : {}),
            safety_check: SAFETY_CHECK,
            tools: serverTools(initial.search ?? false),
            ...(titleRequests.has(controller) ? { title: { enabled: true } } : {}),
          },
          controller.signal
        )
        const blockIndexes = new Map<number, number>()
        for await (const event of events) {
          receivedContent ||= event.type === 'content_block_start'
          if (
            event.type === 'message_delta' &&
            (event.delta.stop_reason === 'end_turn' || event.delta.stop_reason === 'max_tokens') &&
            event.delta.title?.trim() &&
            titleRequests.has(controller) &&
            !controller.signal.aborted &&
            !get().importingHistory
          ) {
            const title = event.delta.title.trim()
            updateSession(sessionId, (session) => (session.title ? session : { ...session, title }))
            titleRequests.delete(controller)
          }
          reply = applyEvent(reply, event, Date.now(), blockIndexes)
          if (document.visibilityState === 'hidden') {
            flush()
          } else {
            frame ||= requestAnimationFrame(flush)
          }
        }
        reply = settleReply(reply, 'done', Date.now())
        break
      } catch (error) {
        if (controller.signal.aborted) {
          reply = settleReply(reply, 'stopped', Date.now())
          break
        }
        if (preparing) {
          reply = settleReply(reply, 'error', Date.now(), {
            kind: 'upload',
            message: '',
            localMessage: describeUploadError(error),
            retryable: isRetryableApiError(error),
          })
          break
        }
        // 附件失效：重新补传后重发。收到过内容块（含丢弃的客户端工具）后不自动重发。
        if (
          attempt < FILE_RETRY_LIMIT &&
          !receivedContent &&
          reuploadInvalidatedFiles(sessionId, activeRequest, error)
        ) {
          await waitForRetry(attempt, controller.signal)
          if (controller.signal.aborted) {
            reply = settleReply(reply, 'stopped', Date.now())
            break
          }
          continue
        }
        if (error instanceof ApiError && error.kind === 'interrupted' && reply.stopReason) {
          // 已收到 message_delta 的结束原因，只是缺了结尾的 message_stop
          reply = settleReply(reply, 'done', Date.now())
        } else if (error instanceof ApiError) {
          reply = settleReply(reply, 'error', Date.now(), {
            kind: error.kind,
            message: error.message,
            status: error.status,
            localMessage: error.localMessage,
          })
        } else {
          reply = settleReply(reply, 'error', Date.now(), {
            kind: 'protocol',
            message: error instanceof Error ? error.message : String(error),
          })
        }
        break
      }
    }
  } finally {
    titleRequests.delete(controller)
    streamFlushes.delete(sessionId)
    cancelAnimationFrame(frame)
    updateReply(sessionId, reply)
    set((state) => ({
      streaming: Object.fromEntries(
        Object.entries(state.streaming).filter(([id]) => id !== sessionId)
      ),
    }))
    persist(sessionId)
    // 回复完成后按开关自动提取长期记忆：每新增 X 轮一次，后台执行，失败静默
    if (reply.status === 'done' && !controller.signal.aborted) {
      const latest = useSettings.getState()
      const session = getSession(sessionId)
      if (latest.memoryEnabled && latest.autoMemoryEnabled && session) {
        void extractMemories({
          session,
          apiKey: latest.apiKey ?? '',
          every: latest.autoMemoryRounds,
          onExtracted: (userMessageId) =>
            setSessionMemoryCursor(sessionId, userMessageId ? { userMessageId } : undefined),
        })
      }
    }
  }
}
