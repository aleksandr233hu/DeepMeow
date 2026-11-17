import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { compressSession, restoreCompression } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { showToast } from '../base/toastState.js'
import styles from './CompressionCard.module.css'

/** 已压缩对话的摘要卡片：查看摘要、展开原文、恢复原文或重新压缩 */
export const CompressionCard = ({
  session,
  count,
  shown,
  onToggle,
}: {
  session: Session
  count: number
  shown: boolean
  onToggle: () => void
}) => {
  const t = useTranslate()
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const compression = session.compression
  if (!compression) {
    return null
  }

  const restore = () => {
    if (restoreCompression(session.id)) {
      showToast({ key: 'restoreCompressedDone' })
    } else {
      showToast({ key: 'compressFailed', type: 'error' })
    }
  }

  const recompress = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    const result = await compressSession(session.id)
    setBusy(false)
    if (result === 'done') {
      showToast({ key: 'compressDone' })
    } else if (result === 'tooShort') {
      showToast({ key: 'compressTooShort', type: 'error' })
    } else if (result === 'failed') {
      showToast({ key: 'compressFailed', type: 'error' })
    }
  }

  return (
    <div className={styles.card}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={summaryOpen}
        onClick={() => setSummaryOpen((value) => !value)}
      >
        <span className={styles.count}>{t('compressedHistoryCount', { count })}</span>
        <span className={styles.toggleSummary}>
          {t(summaryOpen ? 'hideSummary' : 'viewSummary')}
        </span>
      </button>
      {summaryOpen ? <div className={styles.summary}>{compression.summary}</div> : null}
      <div className={styles.actions}>
        <button type="button" className={styles.action} onClick={onToggle}>
          {t(shown ? 'hideCompressed' : 'showCompressed')}
        </button>
        <button type="button" className={styles.action} onClick={restore}>
          {t('restoreCompressed')}
        </button>
        <button
          type="button"
          className={clsx(styles.action, busy && styles.busy)}
          disabled={busy}
          onClick={() => void recompress()}
        >
          {t(busy ? 'compressing' : 'recompress')}
        </button>
      </div>
    </div>
  )
}
