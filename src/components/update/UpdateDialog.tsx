import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { useUpdateStore } from '../../services/update/updateState.js'
import styles from './UpdateDialog.module.css'

/** 发现新版本时的更新窗口：说明 + 下载进度 + 调起安装 */
export const UpdateDialog = () => {
  const t = useTranslate()
  const open = useUpdateStore((state) => state.dialogOpen)
  const phase = useUpdateStore((state) => state.phase)
  const info = useUpdateStore((state) => state.info)
  const progress = useUpdateStore((state) => state.progress)
  const close = useUpdateStore((state) => state.closeDialog)
  const download = useUpdateStore((state) => state.download)
  const install = useUpdateStore((state) => state.install)

  if (!open || !info) {
    return null
  }

  const percent = progress === null ? null : Math.round(progress * 100)
  const downloading = phase === 'downloading'
  const ready = phase === 'ready'

  return (
    <Modal
      title={t('updateDialogTitle', { version: info.version })}
      className={styles.dialog}
      onClose={downloading ? () => {} : close}
      footer={
        <>
          <Button variant="outlined" size="m" disabled={downloading} onClick={close}>
            {t('updateLater')}
          </Button>
          {ready ? (
            <Button variant="primary" size="m" onClick={() => void install()}>
              {t('updateInstall')}
            </Button>
          ) : (
            <Button
              variant="primary"
              size="m"
              disabled={downloading}
              onClick={() => void download()}
            >
              {downloading
                ? percent === null
                  ? t('updateDownloadingUnknown')
                  : t('updateDownloading', { percent })
                : t('updateDownload')}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.notes}>{info.notes || t('updateNoNotes')}</div>
      {downloading || ready ? (
        <div className={styles.progress}>
          <div className={styles.progressHead}>
            <span className={styles.progressIcon} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M5 7h12l-1.2 12H6.2L5 7Z" fill="#E9AE45" />
                <path d="M5 7h12l-.3 3H5.3L5 7Z" fill="#D99A32" />
                <path d="M6.5 5.5h9" stroke="#8A9AAE" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="11" cy="13.4" r="1.5" fill="#FAF7F2" />
                <circle cx="8.7" cy="11.4" r="0.9" fill="#FAF7F2" />
                <circle cx="13.3" cy="11.4" r="0.9" fill="#FAF7F2" />
              </svg>
            </span>
            <div className={styles.track}>
              <div
                className={styles.fill}
                style={{ width: `${percent ?? 0}%` }}
              />
            </div>
          </div>
          <div className={styles.hint}>
            {ready
              ? t('updateReady')
              : percent === null
                ? t('updateDownloadingUnknown')
                : t('updateDownloading', { percent })}
          </div>
        </div>
      ) : null}
      <div className={styles.tip}>{t('updateInstallHint')}</div>
    </Modal>
  )
}
