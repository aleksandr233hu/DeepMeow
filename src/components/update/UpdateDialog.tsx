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
          <div className={styles.track}>
            <div
              className={styles.fill}
              style={{ width: `${percent ?? 0}%` }}
            />
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
