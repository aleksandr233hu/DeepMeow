import { useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { getForkRounds } from '../../services/chat/fork.js'
import { getReplyText } from '../../services/chat/reply.js'
import { forkSessionFromMessage, useChatStore } from '../../services/chat/store.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { closeForkDialog, useForkDialog } from './forkDialogState.js'
import styles from './ForkDialog.module.css'

/** 从这里新建对话：选择要带进新会话的历史对话组 */
export const ForkDialog = () => {
  const sessionId = useForkDialog((state) => state.sessionId)
  const messageId = useForkDialog((state) => state.messageId)
  return sessionId && messageId ? (
    <ForkDialogContent key={`${sessionId}:${messageId}`} sessionId={sessionId} messageId={messageId} />
  ) : null
}

const ForkDialogContent = ({
  sessionId,
  messageId,
}: {
  sessionId: string
  messageId: string
}) => {
  const t = useTranslate()
  const session = useChatStore((state) =>
    Object.hasOwn(state.sessionCache, sessionId) ? state.sessionCache[sessionId] : undefined
  )
  const rounds = useMemo(
    () => (session ? (getForkRounds(session, messageId) ?? []) : []),
    [session, messageId]
  )
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rounds.map((round) => round.id))
  )
  const allSelected = rounds.length > 0 && selected.size === rounds.length
  const targetRoundId = rounds.find((round) => round.assistant.id === messageId)?.id
  const targetAppended = !targetRoundId || !selected.has(targetRoundId)

  if (!session) {
    return null
  }

  const toggleRound = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(rounds.map((round) => round.id)))
  }

  const create = () => {
    const forkedId = forkSessionFromMessage(sessionId, messageId, [...selected])
    if (forkedId) {
      closeForkDialog()
      showToast({ key: 'forkCreated' })
    } else {
      showToast({ key: 'forkCreateFailed', type: 'error' })
    }
  }

  return (
    <Modal
      title={t('forkDialogTitle')}
      closable
      className={styles.dialog}
      onClose={closeForkDialog}
      footer={
        <div className={styles.footer}>
          <span className={styles.count}>
            {t('forkSelectedCount', { count: selected.size })}
            {targetAppended ? ` · ${t('forkTargetAppended')}` : ''}
          </span>
          <Button size="m" onClick={create}>
            {t('forkCreate')}
          </Button>
        </div>
      }
    >
      <div className={styles.description}>{t('forkDialogDescription')}</div>
      <label className={styles.selectAll}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={allSelected}
          onChange={toggleAll}
        />
        <span>{t('forkSelectAll')}</span>
      </label>
      <div className={styles.list}>
        {rounds.length === 0 ? <div className={styles.empty}>{t('forkNoRounds')}</div> : null}
        {rounds.map((round) => (
          <label key={round.id} className={styles.round}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={selected.has(round.id)}
              onChange={() => toggleRound(round.id)}
            />
            <div className={styles.content}>
              <div className={styles.user}>
                {round.user.content || t('forkAttachmentOnly', { count: round.user.files.length })}
                {round.user.content && round.user.files.length > 0 ? (
                  <span className={styles.files}>
                    {t('forkAttachmentCount', { count: round.user.files.length })}
                  </span>
                ) : null}
                {round.assistant.id === messageId ? (
                  <span className={styles.target}>{t('forkTargetBadge')}</span>
                ) : null}
              </div>
              <div className={styles.assistant}>
                {getReplyText(round.assistant) || t('forkEmptyReply')}
              </div>
            </div>
          </label>
        ))}
      </div>
    </Modal>
  )
}
