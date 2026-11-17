import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { resolveIdentitySource } from '../../services/chat/identity.js'
import { resolvePreset, usePresetStore } from '../../services/presets/store.js'
import { useSettings } from '../../services/settings.js'
import {
  compressSession,
  setSessionPinned,
  setSessionPreset,
  type CompressResult,
} from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import {
  IconCheckOutline16,
  IconDownloadOutline16,
  IconEllipsisOutline16,
  IconThinkOutline16,
} from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import styles from './SessionToolbar.module.css'

const safeFileName = (title: string) =>
  title.replace(/[\\/:*?"<>|]/g, '_').trim() || 'deepseek-chat'

/** 会话工具栏：压缩较早对话、导出当前对话；桌面端在标题行右侧，移动端单独一行 */
export const SessionToolbar = ({
  session,
  streaming,
}: {
  session: Session
  streaming: boolean
}) => {
  const t = useTranslate()
  const presets = usePresetStore((state) => state.presets)
  const globalIdentitySource = useSettings((state) => state.identitySource)
  const identitySource = resolveIdentitySource(session, globalIdentitySource)
  const currentPreset = resolvePreset(session.presetId)
  const [compressing, setCompressing] = useState(false)
  const [exporting, setExporting] = useState(false)

  const notifyCompress = (result: CompressResult) => {
    if (result === 'done') {
      showToast({ key: 'compressDone' })
    } else if (result === 'tooShort') {
      showToast({ key: 'compressTooShort', type: 'error' })
    } else if (result === 'failed') {
      showToast({ key: 'compressFailed', type: 'error' })
    }
  }

  const compress = async () => {
    if (compressing || streaming) {
      return
    }
    setCompressing(true)
    const result = await compressSession(session.id)
    setCompressing(false)
    notifyCompress(result)
  }

  const exportSession = async () => {
    if (exporting || streaming) {
      return
    }
    setExporting(true)
    try {
      const { exportArchive } = await import('../../services/chat/history/exportArchive.js')
      const blob = await exportArchive([session])
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${safeFileName(session.title)}-${new Date()
        .toISOString()
        .slice(0, 10)}.zip`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      showToast({
        key: 'exportSessionFailed',
        params: { message: error instanceof Error ? error.message : String(error) },
        type: 'error',
      })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className={styles.toolbar}>
      {compressing ? <span className={styles.status}>{t('compressing')}</span> : null}
      {session.compression ? (
        <span className={styles.badge}>{t('compressedBadge')}</span>
      ) : null}
      {identitySource === 'agent' ? (
        <span className={styles.badge}>{t('identityAgentBadge')}</span>
      ) : null}
      <Menu
        options={presets.map((preset) => ({
          key: preset.id,
          label: preset.name,
          icon: preset.id === currentPreset?.id ? <IconCheckOutline16 /> : undefined,
          onSelect: () => setSessionPreset(session.id, preset.id),
        }))}
      >
        {({ toggle }) => (
          <button
            type="button"
            className={styles.preset}
            title={t(identitySource === 'agent' ? 'personaIgnoredByAgentHint' : 'choosePreset')}
            onClick={toggle}
          >
            {currentPreset ? currentPreset.name : t('choosePreset')}
          </button>
        )}
      </Menu>
      <Menu
        options={[
          {
            key: 'pin',
            label: session.pinned ? t('sessionUnpin') : t('sessionPin'),
            onSelect: () => setSessionPinned(session.id, !session.pinned),
          },
          {
            key: 'compress',
            label: t('compressSession'),
            icon: <IconThinkOutline16 />,
            onSelect: () => void compress(),
          },
          {
            key: 'export',
            label: t('exportSession'),
            icon: <IconDownloadOutline16 />,
            onSelect: () => void exportSession(),
          },
        ]}
      >
        {({ toggle }) => (
          <IconButton
            icon={<IconEllipsisOutline16 />}
            tooltip={t('sessionActions')}
            tooltipPlacement="bottom"
            onClick={toggle}
          />
        )}
      </Menu>
    </div>
  )
}
