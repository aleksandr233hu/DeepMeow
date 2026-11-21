import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import {
  IconEditOutline16,
  IconNewChatOutline16,
  IconRefreshOutline16,
  IconTrashOutline16,
  IconWarningOutline16,
} from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import { useSettings } from '../../services/settings.js'
import {
  continueReply,
  deleteMessage,
  editAssistantReply,
  regenerateReply,
} from '../../services/chat/store.js'
import { stopReadAloud } from '../../services/speech/readAloud.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { CollapsibleContent } from './CollapsibleContent.js'
import { MessageActionsMenu } from './MessageActionsMenu.js'
import { MessageAvatar } from './MessageAvatar.js'
import { openForkDialog } from './forkDialogState.js'
import { ReplyArea } from './ReplyArea.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const foldLongMessages = useSettings((state) => state.foldLongMessages)
  const bubbleLayout = useSettings((state) => state.messageLayout) === 'bubble'
  const showAvatars = useSettings((state) => state.showAvatars)
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：已下发的思考与正文按协议丢弃，只显示模板答复。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const editorRef = useRef<HTMLTextAreaElement>(null)
  // 编辑框随内容长高，最多占视口 60%，长回复不再挤在小框里
  useEffect(() => {
    const node = editorRef.current
    if (!node) {
      return
    }
    node.style.height = 'auto'
    node.style.height = `${Math.min(node.scrollHeight, window.innerHeight * 0.6)}px`
  }, [draft, editing])
  const canEdit =
    !refused && (message.status === 'done' || message.status === 'stopped') && responseText !== ''
  const startEdit = () => {
    if (busy || !canEdit) {
      return
    }
    stopReadAloud()
    setDraft(responseText)
    setEditing(true)
  }
  const saveEdit = () => {
    if (editAssistantReply(sessionId, message.id, draft)) {
      setEditing(false)
    } else {
      showToast({ key: 'editReplyFailed', type: 'error' })
    }
  }
  const [deleteOpen, setDeleteOpen] = useState(false)
  const hasVersions = versions.ids.length > 1
  const remove = (includeVersions = false) => {
    if (busy) {
      return
    }
    const undo = deleteMessage(sessionId, message.id, { includeVersions })
    if (undo) {
      showToast({ key: 'messageDeleted', action: { key: 'undo', onClick: undo } })
    } else {
      showToast({ key: 'messageDeleteFailed', type: 'error' })
    }
  }
  // 有多个版本时先问删哪个范围，单版本直接删
  const requestDelete = () => {
    if (busy) {
      return
    }
    if (hasVersions) {
      setDeleteOpen(true)
    } else {
      remove()
    }
  }
  const fork = () => {
    if (busy) {
      return
    }
    openForkDialog(sessionId, message.id)
  }
  const answerView =
    answer && !editing ? (
      <CollapsibleContent enabled={!streaming && foldLongMessages}>
        <Markdown
          className="ds-assistant-message-main-content"
          content={answer.markdown}
          loading={streaming}
          cacheKey={message.id}
          disableLink={false}
          sources={view.sources}
        />
      </CollapsibleContent>
    ) : null
  const editorView = editing ? (
    <div className={styles.editor}>
      <textarea
        ref={editorRef}
        className={styles.textarea}
        aria-label={t('editReply')}
        autoFocus
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return
          }
          if (event.key === 'Escape') {
            setEditing(false)
          } else if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !isMobile) {
            event.preventDefault()
            saveEdit()
          }
        }}
      />
      <div className={styles.editorActions}>
        <Button size="s" variant="outlined" onClick={() => setEditing(false)}>
          {t('cancel')}
        </Button>
        <Button size="s" disabled={!draft.trim()} onClick={saveEdit}>
          {t('save')}
        </Button>
      </div>
    </div>
  ) : null
  const body = (
    <>
      {answerView}
      {editorView}
    </>
  )
  return (
    <div
      className={clsx(styles.message, bubbleLayout && styles.bubbleLayout, showAvatars && styles.withAvatar)}
      data-message-role="assistant"
      data-message-id={message.id}
    >
      {showAvatars ? (
        <span className={styles.avatarSlot}>
          <MessageAvatar role="assistant" thinking={streaming} />
        </span>
      ) : null}
      {refused ? null : (
        <ReplyArea
          message={message}
          view={view}
          streaming={streaming}
          hasResponse={!!responseText}
        />
      )}
      {bubbleLayout ? <div className={styles.answerBubble}>{body}</div> : body}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('general')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <a
                  className={styles.noticeAction}
                  href={TOP_UP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('topUp')}
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {message.editedAt ? <span className={styles.edited}>{t('edited')}</span> : null}
            {copyText ? <CopyButton text={copyText} /> : null}
            {responseText && !refused ? (
              <ReadAloudButton messageId={message.id} text={responseText} />
            ) : null}
            <IconButton
              icon={<IconRefreshOutline16 />}
              tooltip={t('regenerate')}
              tooltipPlacement="bottom"
              disabled={busy || refused}
              onClick={() => {
                stopReadAloud()
                regenerateReply(sessionId, message.id)
              }}
            />
            <MessageActionsMenu
              label={t('messageActions')}
              options={[
                ...(canEdit
                  ? [
                      {
                        key: 'edit',
                        label: t('editReply'),
                        icon: <IconEditOutline16 />,
                        onSelect: startEdit,
                      },
                    ]
                  : []),
                {
                  key: 'fork',
                  label: t('forkFromHere'),
                  icon: <IconNewChatOutline16 />,
                  onSelect: fork,
                },
                {
                  key: 'delete',
                  label: t('deleteMessage'),
                  icon: <IconTrashOutline16 />,
                  danger: true,
                  onSelect: requestDelete,
                },
              ]}
            />
          </div>
          {isLast && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
      {deleteOpen ? (
        <Modal
          title={t('deleteMessage')}
          onClose={() => setDeleteOpen(false)}
          footer={
            <>
              <Button variant="outlined" onClick={() => setDeleteOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                variant="dangerOutlined"
                onClick={() => {
                  setDeleteOpen(false)
                  remove(true)
                }}
              >
                {t('deleteMessageWithVersions')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setDeleteOpen(false)
                  remove()
                }}
              >
                {t('deleteMessageOnlyCurrent')}
              </Button>
            </>
          }
        >
          {t('deleteMessageVersionsDescription', { count: versions.ids.length })}
        </Modal>
      ) : null}
    </div>
  )
})
