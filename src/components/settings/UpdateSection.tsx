import { useTranslate } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { SettingCell } from './SettingCell.js'
import { supportsInAppUpdate } from '../../services/update/update.js'
import { useUpdateStore } from '../../services/update/updateState.js'
import styles from './Settings.module.css'

/** 通用设置底部：显示当前版本，可手动检查更新 */
export const UpdateSection = () => {
  const t = useTranslate()
  const phase = useUpdateStore((state) => state.phase)
  const currentVersion = useUpdateStore((state) => state.currentVersion)
  const info = useUpdateStore((state) => state.info)
  const check = useUpdateStore((state) => state.check)
  const openDialog = useUpdateStore((state) => state.openDialog)
  const webPhase = useUpdateStore((state) => state.webPhase)
  const webVersion = useUpdateStore((state) => state.webVersion)
  const webNextVersion = useUpdateStore((state) => state.webNextVersion)
  const webRequiredAppVersion = useUpdateStore((state) => state.webRequiredAppVersion)
  const checkWeb = useUpdateStore((state) => state.checkWeb)

  if (!supportsInAppUpdate()) {
    return null
  }

  const status =
    phase === 'checking'
      ? { key: 'updateChecking' as const }
      : phase === 'uptodate'
        ? { key: 'updateUpToDate' as const }
        : phase === 'failed'
          ? { key: 'updateFailed' as const, error: true }
          : phase === 'available' && info
            ? { key: 'updateAvailable' as const, params: { version: info.version } }
            : phase === 'downloading' || phase === 'ready'
              ? { key: 'updateAvailable' as const, params: { version: info?.version ?? '' } }
              : null

  const available = phase === 'available' || phase === 'downloading' || phase === 'ready'

  const webStatus =
    webPhase === 'checking'
      ? { key: 'webUpdateChecking' as const }
      : webPhase === 'downloading'
        ? { key: 'webUpdateDownloading' as const }
        : webPhase === 'latest'
          ? { key: 'webUpdateLatest' as const }
          : webPhase === 'failed'
            ? { key: 'webUpdateFailed' as const, error: true }
            : webPhase === 'requiresApp' && webRequiredAppVersion
              ? {
                  key: 'webUpdateRequiresApp' as const,
                  params: { version: webRequiredAppVersion },
                }
              : null

  return (
    <>
      <SettingCell
        label={t('updateSectionLabel')}
        description={t('updateCurrent', { version: currentVersion || '—' })}
        status={status}
        action={
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            disabled={phase === 'checking' || phase === 'downloading'}
            onClick={() => (available ? openDialog() : void check())}
          >
            {available ? t('updateOpen') : t('updateCheck')}
          </Button>
        }
      />
      <SettingCell
        label={t('webUpdateLabel')}
        description={
          webNextVersion
            ? t('webUpdatePending', { version: webNextVersion })
            : t('webUpdateCurrent', { version: webVersion })
        }
        status={webStatus}
        action={
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            disabled={webPhase === 'checking' || webPhase === 'downloading'}
            onClick={() => void checkWeb()}
          >
            {t('webUpdateCheck')}
          </Button>
        }
      />
    </>
  )
}
