import { useMemo, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useChatStore } from '../../services/chat/store.js'
import { useMemoryStore, VERSION_MEMORY_ID } from '../../services/memory/store.js'
import {
  busiestHour,
  daysSince,
  readDiaryStats,
  resolveFirstApiKeyAt,
  scanDiary,
  type DiaryStats,
} from '../../services/stats/diary.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { SettingCell } from './SettingCell.js'
import styles from './DiaryDialog.module.css'

/** 设置里的「猫窝日记」入口 */
export const DiarySection = () => {
  const t = useTranslate()
  const [open, setOpen] = useState(false)
  return (
    <>
      <SettingCell
        label={t('diaryLabel')}
        description={t('diaryDescription')}
        status={null}
        action={
          <Button variant="outlined" size="m" onClick={() => setOpen(true)}>
            {t('diaryOpen')}
          </Button>
        }
      />
      {open ? <DiaryDialog onClose={() => setOpen(false)} /> : null}
    </>
  )
}

const DiaryDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const memories = useMemoryStore((state) => state.memories)
  const [stats, setStats] = useState<DiaryStats>(() => readDiaryStats())
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const firstApiAt = useMemo(() => resolveFirstApiKeyAt(sessions), [sessions])
  const memoryCount = memories.filter((memory) => memory.id !== VERSION_MEMORY_ID).length
  const hour = busiestHour(stats.hours)
  const maxHour = Math.max(1, ...stats.hours)

  const startScan = async () => {
    if (scanning) {
      return
    }
    setScanning(true)
    setFailed(false)
    setProgress(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const next = await scanDiary({
        sessions,
        onProgress: (done, total) => setProgress({ done, total }),
        signal: controller.signal,
      })
      setStats(next)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setFailed(true)
      }
    } finally {
      abortRef.current = null
      setScanning(false)
      setProgress(null)
    }
  }

  const cancelScan = () => {
    abortRef.current?.abort()
  }

  return (
    <Modal title={t('diaryTitle')} onClose={onClose} footer={<Button onClick={onClose}>{t('close')}</Button>}>
      <div className={styles.body}>
        <div className={styles.hint}>{t('diaryDescription')}</div>

        {stats.scanAt === null ? (
          <div className={styles.scanBox}>
            <div className={styles.intro}>{t('diaryIntro')}</div>
            {progress ? (
              <div className={styles.progress}>
                {t('diaryScanning', { done: progress.done, total: progress.total })}
              </div>
            ) : null}
            {failed ? <div className={styles.failed}>{t('diaryScanFailed')}</div> : null}
            <div className={styles.scanActions}>
              {scanning ? (
                <Button variant="outlined" size="s" onClick={cancelScan}>
                  {t('diaryCancelScan')}
                </Button>
              ) : (
                <Button size="s" onClick={() => void startScan()}>
                  {t('diaryScan')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={styles.cards}>
              <div className={styles.card}>
                <div className={styles.cardValue}>{firstApiAt ? daysSince(firstApiAt) : '—'}</div>
                <div className={styles.cardLabel}>{t('diaryDaysLabel')}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardValue}>{stats.rounds}</div>
                <div className={styles.cardLabel}>{t('diaryRoundsLabel')}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardValue}>{memoryCount}</div>
                <div className={styles.cardLabel}>{t('diaryMemoriesLabel')}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardValue}>
                  {hour === null ? '—' : t('diaryHourValue', { hour })}
                </div>
                <div className={styles.cardLabel}>{t('diaryBusiestLabel')}</div>
              </div>
            </div>

            <div className={styles.chartTitle}>{t('diaryHoursTitle')}</div>
            <div className={styles.chart} aria-hidden>
              {stats.hours.map((value, index) => (
                <span
                  key={index}
                  className={value > 0 && index === hour ? styles.barActive : styles.bar}
                  style={{ height: `${Math.max(3, Math.round((value / maxHour) * 100))}%` }}
                  title={`${index}:00 · ${value}`}
                />
              ))}
            </div>
            <div className={styles.chartAxis}>
              <span>0</span>
              <span>6</span>
              <span>12</span>
              <span>18</span>
              <span>23</span>
            </div>

            <div className={styles.footerHint}>{t('diaryLocalHint')}</div>
            <div className={styles.rescan}>
              {scanning ? (
                <Button variant="outlined" size="s" onClick={cancelScan}>
                  {t('diaryCancelScan')}
                </Button>
              ) : (
                <Button variant="outlined" size="s" onClick={() => void startScan()}>
                  {t('diaryRescan')}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
