import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  CONTEXT_WINDOW,
  formatContextTokens,
  getContextUsage,
} from '../../services/chat/contextUsage.js'
import { compressSession, useChatStore } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import styles from './ContextMeter.module.css'

const RADIUS = 9
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** 输入框旁的上文用量：圆环 + 已用 k，点击查看明细并可压缩对话 */
export const ContextMeter = ({ session }: { session: Session }) => {
  const t = useTranslate()
  const usage = getContextUsage(session)
  const streaming = useChatStore((state) => Object.hasOwn(state.streaming, session.id))
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ratio = Math.min(1, usage.used / usage.limit)
  const level = ratio >= 0.95 ? styles.danger : ratio >= 0.8 ? styles.warn : undefined
  const dash = CIRCUMFERENCE * ratio

  const compress = async () => {
    if (busy || streaming) {
      return
    }
    setBusy(true)
    const result = await compressSession(session.id)
    setBusy(false)
    if (result === 'done') {
      setOpen(false)
      showToast({ key: 'compressDone' })
    } else if (result === 'tooShort') {
      showToast({ key: 'compressTooShort', type: 'error' })
    } else if (result === 'failed') {
      showToast({ key: 'compressFailed', type: 'error' })
    }
  }

  return (
    <>
      <button
        type="button"
        className={clsx(styles.meter, level)}
        aria-label={`${t('contextUsage')}: ${formatContextTokens(usage.used)}`}
        onClick={() => setOpen(true)}
      >
        <svg className={styles.ring} viewBox="0 0 24 24" width="20" height="20" aria-hidden>
          <circle className={styles.track} cx="12" cy="12" r={RADIUS} />
          <circle
            className={styles.progress}
            cx="12"
            cy="12"
            r={RADIUS}
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform="rotate(-90 12 12)"
          />
        </svg>
        <span className={styles.text}>{formatContextTokens(usage.used)}</span>
      </button>

      {open ? (
        <Modal
          title={t('contextUsage')}
          closable
          className={styles.dialog}
          onClose={() => setOpen(false)}
          footer={
            <div className={styles.footer}>
              <Button variant="outlined" size="m" onClick={() => setOpen(false)}>
                {t('close')}
              </Button>
              <Button
                size="m"
                disabled={busy || streaming}
                onClick={() => void compress()}
              >
                {t(busy ? 'compressing' : 'compressSession')}
              </Button>
            </div>
          }
        >
          <div className={styles.summary}>
            <div className={styles.big}>{formatContextTokens(usage.used)}</div>
            <div className={styles.limit}>
              {t('contextUsedOfLimit', {
                used: usage.used.toLocaleString(),
                limit: CONTEXT_WINDOW.toLocaleString(),
              })}
            </div>
            <div className={styles.source}>
              {t(usage.measured ? 'contextFromLastRequest' : 'contextEstimated')}
              {usage.measured && usage.estimated ? ` · ${t('contextMixedEstimate')}` : ''}
            </div>
          </div>

          <div className={styles.bar}>
            <div className={clsx(styles.barFill, level)} style={{ width: `${ratio * 100}%` }} />
          </div>

          <dl className={styles.rows}>
            <div className={styles.row}>
              <dt>{t('contextRemaining')}</dt>
              <dd>{usage.remaining.toLocaleString()}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t('contextInput')}</dt>
              <dd>{usage.input.toLocaleString()}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t('contextCacheRead')}</dt>
              <dd>{usage.cacheRead.toLocaleString()}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t('contextCacheCreation')}</dt>
              <dd>{usage.cacheCreation.toLocaleString()}</dd>
            </div>
            <div className={styles.row}>
              <dt>{t('contextOutput')}</dt>
              <dd>{usage.output.toLocaleString()}</dd>
            </div>
          </dl>
          <div className={styles.hint}>{t('contextHint')}</div>
        </Modal>
      ) : null}
    </>
  )
}
