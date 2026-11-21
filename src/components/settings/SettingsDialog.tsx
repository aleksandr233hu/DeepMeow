import clsx from 'clsx'
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
  IconCatFace16,
  IconDarkOutline16,
  IconDataOutline16,
  IconDownloadOutline16,
  IconEditOutline16,
  IconFollowsystemOutline16,
  IconGlobeLanguageOutline14,
  IconLightOutline16,
  IconPaw16,
  IconSettingsOutline16,
  IconUploadOutline14,
} from '../base/icons.js'
import {
  BackupError,
  clearHistory,
  exportHistory,
} from '../../services/chat/backup.js'
import { useIsMobile } from '../../app/viewport.js'
import { useChatStore } from '../../services/chat/store.js'
import { exportProfile, importProfile } from '../../services/backup/profile.js'
import { filePick } from '../../services/chat/history/importSource.js'
import { pickNativeArchive, supportsNativeArchive } from '../../services/chat/history/nativeArchive.js'
import { formatSize } from '../../services/attachments.js'
import { regionCodes, getRegionName, provinces } from '../../services/location.js'
import {
  isChineseBrowser,
  setAccentColor,
  setBubbleWidth,
  setFoldLongMessages,
  setFontPreference,
  setFontScale,
  setLocale,
  setLocation,
  setThemePreference,
  setTtsVoice,
  useSettings,
  type AccentColor,
  type BubbleWidth,
  type FontPreference,
  type ThemePreference,
} from '../../services/settings.js'
import { useTranslate, type TranslationKey, type TranslationMessage } from '../../i18n/index.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { showToast } from '../base/toastState.js'
import { ApiKeyConfirm, ApiKeyField, useApiKeyEditor } from './ApiKeyField.js'
import { ChatSection } from './ChatSection.js'
import { DiarySection } from './DiaryDialog.js'
import { ConnectionTest } from './ConnectionTest.js'
import { useHistoryImport } from './historyImportState.js'
import { MemorySection } from './MemorySection.js'
import { PersonalizationSection } from './PersonalizationSection.js'
import { PresetsSection } from './PresetsSection.js'
import { SettingCell } from './SettingCell.js'
import { UpdateSection } from './UpdateSection.js'
import { Toggle } from '../base/Toggle.js'
import { closeSettings, useSettingsDialog, type SettingsSection } from './settingsDialogState.js'
import styles from './Settings.module.css'

/**
 * 设置弹窗：分「通用设置」（主题、语言、朗读音色、位置）与「数据管理」（API Key、导入、导出、删除）。
 * 桌面端为居中弹窗、左侧导航；移动端为底部弹层、导航横排在内容上方
 */
export const SettingsDialog = () => {
  const open = useSettingsDialog((state) => state.open)
  return open ? <SettingsContent /> : null
}

const sections: {
  value: SettingsSection
  label: TranslationKey
  /** 原名，作为小字显示在内容区顶部 */
  legacy: TranslationKey
  icon: ReactNode
}[] = [
  {
    value: 'general',
    label: 'settingDialogAsideGeneralOptionLabel',
    legacy: 'settingDialogAsideGeneralLegacy',
    icon: <IconSettingsOutline16 />,
  },
  {
    value: 'chat',
    label: 'settingDialogAsideChatOptionLabel',
    legacy: 'settingDialogAsideChatLegacy',
    icon: <IconGlobeLanguageOutline14 />,
  },
  {
    value: 'personalization',
    label: 'settingDialogAsidePersonalizationOptionLabel',
    legacy: 'settingDialogAsidePersonalizationLegacy',
    icon: <IconEditOutline16 />,
  },
  {
    value: 'memory',
    label: 'settingDialogAsideMemoryOptionLabel',
    legacy: 'settingDialogAsideMemoryLegacy',
    icon: <IconPaw16 />,
  },
  {
    value: 'presets',
    label: 'settingDialogAsidePresetsOptionLabel',
    legacy: 'settingDialogAsidePresetsLegacy',
    icon: <IconCatFace16 />,
  },
  {
    value: 'data',
    label: 'settingDialogAsideDataOptionLabel',
    legacy: 'settingDialogAsideDataLegacy',
    icon: <IconDataOutline16 />,
  },
]

const SettingsContent = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  // 打开时按调用方指定的分组选中，之后在弹窗内切换
  const [section, setSection] = useState(() => useSettingsDialog.getState().section)
  const currentSection = sections.find((item) => item.value === section)
  // 切换分组不丢失正在输入的 API Key 与导入状态
  const apiKeyEditor = useApiKeyEditor()
  const historyImport = useHistoryImport()
  const historyDelete = useHistoryDelete()
  const replacingHistory = useChatStore((state) => state.importingHistory)
  const historyBusy = historyImport.busy || historyDelete.busy || replacingHistory
  return (
    <>
      <Modal
        title={t('settings')}
        closable
        className={styles.dialog}
        mainClassName={styles.dialogMain}
        onClose={() => {
          if (!historyDelete.busy) {
            closeSettings()
          }
        }}
      >
        <div role="tablist" className={styles.navigation}>
          {sections.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={section === item.value}
              className={clsx(styles.navItem, section === item.value && styles.navItemActive)}
              onClick={() => setSection(item.value)}
            >
              {item.icon}
              {t(item.label)}
            </button>
          ))}
        </div>
        <div role="tabpanel" className={styles.content}>
          {currentSection ? (
            <div className={styles.sectionHeading}>
              <div className={styles.sectionHeadingTitle}>{t(currentSection.label)}</div>
              <div className={styles.sectionHeadingSub}>{t(currentSection.legacy)}</div>
            </div>
          ) : null}
          {section === 'general' ? (
            <>
              <ApiKeyField editor={apiKeyEditor} />
              <ConnectionTest />
              <ImportHistory disabled={historyBusy} />
              <FontPreferenceSetting />
              <ThemeSetting />
              <AccentSetting />
              <FontScaleSetting />
              <BubbleWidthSetting />
              <FoldLongMessagesSetting />
              <LocaleSetting />
              <TtsVoiceSetting />
              <LocationSetting />
              <UpdateSection />
              <DiarySection />
              {isMobile ? <ApiKeyConfirm editor={apiKeyEditor} /> : null}
            </>
          ) : section === 'chat' ? (
            <ChatSection />
          ) : section === 'personalization' ? (
            <PersonalizationSection />
          ) : section === 'memory' ? (
            <MemorySection />
          ) : section === 'presets' ? (
            <PresetsSection />
          ) : (
            <>
              <ExportHistory disabled={historyBusy} />
              <ExportProfile disabled={historyBusy} />
              <ImportProfile disabled={historyBusy} />
              <SettingCell
                label={t('deleteAllSessions')}
                status={null}
                action={
                  <Button
                    variant="dangerOutlined"
                    size="m"
                    className={styles.cellButton}
                    disabled={historyBusy}
                    onClick={historyDelete.open}
                  >
                    {t('delete')}
                  </Button>
                }
              />
            </>
          )}
        </div>
      </Modal>
      {historyImport.file ? <ImportConfirm /> : null}
      {historyDelete.opened ? <DeleteAllConfirm historyDelete={historyDelete} /> : null}
    </>
  )
}

/** 删除确认保留在设置之上；失败可重试，成功只关闭确认弹窗。 */
const DeleteAllConfirm = ({
  historyDelete,
}: {
  historyDelete: ReturnType<typeof useHistoryDelete>
}) => {
  const t = useTranslate()
  return (
    <Modal
      title={t('deleteAllSessionsModalTitle')}
      className={styles.deleteConfirm}
      onClose={historyDelete.cancel}
      footer={
        <div className={styles.deleteActions} aria-busy={historyDelete.busy}>
          <Button
            variant="outlined"
            autoFocus
            disabled={historyDelete.busy}
            onClick={historyDelete.cancel}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            disabled={historyDelete.busy}
            onClick={() => void historyDelete.confirm()}
          >
            {t(historyDelete.busy ? 'historyDeleting' : 'deleteAllSessions')}
          </Button>
        </div>
      }
    >
      {t('deleteAllSessionsModalDescription')}
    </Modal>
  )
}

const useHistoryDelete = () => {
  const [opened, setOpened] = useState(false)
  const [busy, setBusy] = useState(false)
  const deleting = useRef(false)

  const confirm = async () => {
    if (deleting.current) {
      return
    }
    deleting.current = true
    setBusy(true)
    try {
      await clearHistory()
      setOpened(false)
      showToast({ key: 'historyDeleted' })
    } catch {
      showToast({ key: 'historyDeleteFailed', type: 'error' })
    } finally {
      deleting.current = false
      setBusy(false)
    }
  }

  return {
    opened,
    busy,
    open: () => setOpened(true),
    cancel: () => {
      if (!deleting.current) {
        setOpened(false)
      }
    },
    confirm,
  }
}

const LocationSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const location = useSettings((state) => state.location)
  const province =
    location?.region === 'CN'
      ? provinces.find((item) => item.code === location.province)
      : undefined

  return (
    <SettingCell
      label={t('settingsLocation')}
      status={null}
      className={styles.locationCell}
      action={
        <div className={styles.locationSelectors}>
          {isChineseBrowser() ? (
            <>
              <Select
                ariaLabel={t('settingsLocationProvince')}
                className={styles.provinceSelect}
                value={province?.code ?? ''}
                placeholder={t('settingsLocationProvince')}
                options={provinces.map((item) => ({ value: item.code, label: item.name }))}
                onChange={(value) => {
                  if (value !== province?.code) {
                    setLocation({ region: 'CN', province: value })
                  }
                }}
              />
              <Select
                ariaLabel={t('settingsLocationCity')}
                className={styles.citySelect}
                value={province ? (location?.city ?? '') : ''}
                disabled={!province?.cities.length}
                placeholder={t('settingsLocationCity')}
                options={
                  province?.cities.map((item) => ({ value: item.code, label: item.name })) ?? []
                }
                onChange={(value) => {
                  if (province) {
                    setLocation({ region: 'CN', province: province.code, city: value })
                  }
                }}
              />
            </>
          ) : (
            <Select
              ariaLabel={t('settingsLocationRegion')}
              className={styles.regionSelect}
              value={location?.region ?? ''}
              placeholder={t('settingsLocationRegion')}
              options={regionCodes
                .map((code) => ({ value: code, label: getRegionName(code, locale) }))
                .sort((a, b) => a.label.localeCompare(b.label, locale))}
              onChange={(value) => setLocation({ region: value })}
            />
          )}
        </div>
      }
    />
  )
}

const LocaleSetting = () => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  return (
    <SettingCell
      label={t('settingsLocalePreference')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsLocalePreference')}
          value={locale}
          options={[
            { value: 'zh-CN', label: t('settingsLocaleZhCN'), lang: 'zh-CN' },
            { value: 'en-US', label: t('settingsLocaleEnUS'), lang: 'en' },
          ]}
          onChange={setLocale}
        />
      }
    />
  )
}

/** 朗读音色：stella（海星，女声）/ tide（暗潮，男声） */
const TtsVoiceSetting = () => {
  const t = useTranslate()
  const ttsVoice = useSettings((state) => state.ttsVoice)
  return (
    <SettingCell
      label={t('settingsTtsVoice')}
      status={null}
      action={
        <Select
          ariaLabel={t('settingsTtsVoice')}
          value={ttsVoice}
          options={[
            { value: 'tide', label: t('settingsTtsVoiceTide') },
            { value: 'stella', label: t('settingsTtsVoiceStella') },
          ]}
          onChange={setTtsVoice}
        />
      }
    />
  )
}

/** 导入的二次确认，叠在设置弹窗上；文件状态在全局 store 里，关闭设置后重新打开仍会恢复 */
const ImportConfirm = () => {
  const t = useTranslate()
  const historyImport = useHistoryImport()
  return (
    <Modal
      title={t('historyImportConfirmTitle')}
      className={styles.importConfirm}
      onClose={historyImport.cancel}
      footer={
        <>
          <Button variant="outlined" size="m" autoFocus onClick={historyImport.cancel}>
            {t('cancel')}
          </Button>
          <Button variant="outlined" size="m" onClick={() => void historyImport.confirm()}>
            {t('historyImportConfirm')}
          </Button>
        </>
      }
    >
      <div className={styles.importConfirmText}>{t('historyImportConfirmDescription')}</div>
      {/* 大归档的体积几乎都在图片上；关掉后只写对话文字，导入快一个数量级 */}
      <div className={styles.importConfirmOption}>
        <div className={styles.importConfirmOptionText}>
          <div className={styles.label}>{t('historyImportIncludeImages')}</div>
          <div className={styles.description}>
            {t('historyImportIncludeImagesDescription')}
          </div>
        </div>
        <Toggle
          checked={historyImport.includeImages}
          label={t('historyImportIncludeImages')}
          onChange={historyImport.setIncludeImages}
        />
      </div>
      {/* 思考过程与网页摘要在归档里占大头，精简后解析更快 */}
      <div className={styles.importConfirmOption}>
        <div className={styles.importConfirmOptionText}>
          <div className={styles.label}>{t('historyImportCompact')}</div>
          <div className={styles.description}>{t('historyImportCompactDescription')}</div>
        </div>
        <Toggle
          checked={historyImport.compact}
          label={t('historyImportCompact')}
          onChange={historyImport.setCompact}
        />
      </div>
    </Modal>
  )
}

const themeOptions: { value: ThemePreference; label: TranslationKey; icon: ReactNode }[] = [
  {
    value: 'light',
    label: 'avatarMenuSettingsDialogThemeSelectLightOption',
    icon: <IconLightOutline16 />,
  },
  {
    value: 'dark',
    label: 'avatarMenuSettingsDialogThemeSelectDarkOption',
    icon: <IconDarkOutline16 />,
  },
  {
    value: 'system',
    label: 'avatarMenuSettingsDialogThemeSelectSystemOption',
    icon: <IconFollowsystemOutline16 />,
  },
]

/**
 * 主题项：标题下方浅色 / 深色 / 跟随系统三个选块。
 * 与下方语言选项连续排列。
 */
const ThemeSetting = () => {
  const t = useTranslate()
  const themePreference = useSettings((state) => state.themePreference)
  const label = t('avatarMenuSettingsDialogThemeItemLabel')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {themeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={themePreference === option.value}
            className={clsx(
              styles.themeOption,
              themePreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setThemePreference(option.value)}
          >
            {option.icon}
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

const fontOptions: { value: FontPreference; label: TranslationKey }[] = [
  { value: 'round', label: 'fontPreferenceRound' },
  { value: 'system', label: 'fontPreferenceSystem' },
]

/** 字体美化：猫主题圆体或系统字体，选择后立即生效 */
const FontPreferenceSetting = () => {
  const t = useTranslate()
  const fontPreference = useSettings((state) => state.fontPreference)
  const label = t('fontPreference')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.themeOptions}>
        {fontOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={fontPreference === option.value}
            className={clsx(
              styles.themeOption,
              fontPreference === option.value && styles.themeOptionSelected
            )}
            onClick={() => setFontPreference(option.value)}
          >
            {t(option.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

const accentOptions: { value: AccentColor; label: TranslationKey; color: string }[] = [  { value: 'default', label: 'accentDefault', color: '#6f8093' },
  { value: 'blue', label: 'accentBlue', color: '#2563eb' },
  { value: 'green', label: 'accentGreen', color: '#10a37f' },
  { value: 'purple', label: 'accentPurple', color: '#8b5cf6' },
  { value: 'orange', label: 'accentOrange', color: '#f59e0b' },
  { value: 'rose', label: 'accentRose', color: '#e11d48' },
]

/** 强调色：只影响品牌色与主按钮，不改深浅色主题 */
const AccentSetting = () => {
  const t = useTranslate()
  const accentColor = useSettings((state) => state.accentColor)
  const label = t('accentColor')
  return (
    <div className={styles.theme}>
      {label}
      <div role="radiogroup" aria-label={label} className={styles.accentOptions}>
        {accentOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={accentColor === option.value}
            aria-label={t(option.label)}
            title={t(option.label)}
            className={clsx(
              styles.accentSwatch,
              accentColor === option.value && styles.accentSelected
            )}
            style={{ backgroundColor: option.color }}
            onClick={() => setAccentColor(option.value)}
          />
        ))}
      </div>
    </div>
  )
}

const FontScaleSetting = () => {
  const t = useTranslate()
  const fontScale = useSettings((state) => state.fontScale)
  return (
    <SettingCell
      label={t('fontScale')}
      status={null}
      action={
        <Select
          ariaLabel={t('fontScale')}
          value={String(fontScale)}
          options={[
            { value: '0.9', label: t('fontScaleSmall') },
            { value: '1', label: t('fontScaleNormal') },
            { value: '1.1', label: t('fontScaleLarge') },
            { value: '1.2', label: t('fontScaleHuge') },
          ]}
          onChange={(value) => setFontScale(Number(value))}
        />
      }
    />
  )
}

const bubbleWidths: { value: BubbleWidth; label: TranslationKey }[] = [
  { value: 'narrow', label: 'bubbleWidthNarrow' },
  { value: 'comfortable', label: 'bubbleWidthComfortable' },
  { value: 'wide', label: 'bubbleWidthWide' },
]

const BubbleWidthSetting = () => {
  const t = useTranslate()
  const bubbleWidth = useSettings((state) => state.bubbleWidth)
  return (
    <SettingCell
      label={t('bubbleWidth')}
      status={null}
      action={
        <Select
          ariaLabel={t('bubbleWidth')}
          value={bubbleWidth}
          options={bubbleWidths.map((option) => ({
            value: option.value,
            label: t(option.label),
          }))}
          onChange={setBubbleWidth}
        />
      }
    />
  )
}

const FoldLongMessagesSetting = () => {
  const t = useTranslate()
  const foldLongMessages = useSettings((state) => state.foldLongMessages)
  return (
    <SettingCell
      label={t('foldLongMessages')}
      description={t('foldLongMessagesDescription')}
      status={null}
      action={
        <Toggle
          checked={foldLongMessages}
          label={t('foldLongMessages')}
          onChange={setFoldLongMessages}
        />
      }
    />
  )
}

/** `reason` 为失败原因的文案 key，展示时按当前语言翻译后填入 `message` 参数。 */
type Status = (TranslationMessage & { error?: boolean; reason?: TranslationKey }) | null

/** 导出失败附带原因：预期的错误用对应文案作原因，其他错误用错误信息。 */
const errorStatus = (key: TranslationKey, error: unknown): Status => ({
  key,
  ...(error instanceof BackupError
    ? { reason: error.key }
    : { params: { message: error instanceof Error ? error.message : String(error) } }),
  error: true,
})

/** 导入 = 合并：把选中文件的会话追加到现有对话之后，同 ID 的会话跳过。 */
const ImportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const inputRef = useRef<HTMLInputElement>(null)
  const historyImport = useHistoryImport()
  const percent = Math.floor((historyImport.progress ?? 0) * 100)
  // 还没有读到字节时（大文件首次读取可能较慢）用不确定进度条，避免停在 0% 像卡住
  const loading = historyImport.busy && !historyImport.paused && percent === 0
  // 条目读完后进入合并事务，结束前不能取消，避免事务中途中止
  const merging = historyImport.busy && !historyImport.paused && percent >= 100
  const locked = historyImport.cancelling || merging
  const sizeLabel = historyImport.fileSize ? formatSize(historyImport.fileSize) : null
  const sessions = historyImport.sessionProgress
  // 读取阶段带上文件大小与会话计数：大文件首次读取要复制，也让用户看清处理到哪了
  let statusText = `${t('historyImporting')} ${percent}%`
  if (historyImport.cancelling) {
    statusText = t('historyImportCancelling')
  } else if (historyImport.paused) {
    statusText = `${t('historyImportPaused')} ${percent}%`
  } else if (loading) {
    statusText = sizeLabel
      ? t('historyImportReadingSize', { size: sizeLabel })
      : t('historyImportReading')
  } else if (merging) {
    statusText = t('historyImportMerging')
  } else if (sessions && sessions.total > 0) {
    statusText = t('historyImportingSessions', {
      percent,
      done: sessions.done,
      total: sessions.total,
    })
  }

  // Android 原生壳走系统选择器直读，避免几百 MB 的文件先被复制进 WebView 缓存
  const pickFile = async () => {
    if (!supportsNativeArchive()) {
      inputRef.current?.click()
      return
    }
    try {
      const pick = await pickNativeArchive()
      if (pick) {
        historyImport.select(pick)
      }
    } catch {
      showToast({ key: 'historyImportFailed', type: 'error' })
    }
  }

  return (
    <>
      <SettingCell
        label={t('historyImport')}
        description={t('historyImportDescription')}
        status={historyImport.busy ? null : historyImport.status}
        action={
          <>
            <Button
              variant="outlined"
              size="m"
              className={clsx(styles.cellButton, styles.uploadButton)}
              disabled={disabled}
              onClick={() => void pickFile()}
            >
              <IconUploadOutline14 />
              {t('upload')}
            </Button>
            <input
              ref={inputRef}
              type="file"
              // 移动端文件管理器给 ZIP 的 MIME 常与 application/zip 不一致，限制类型会让文件变灰
              // 甚至无法选中；这里放开过滤，由导入流程校验 ZIP 内容，选错时提示导入失败。
              accept={isMobile ? undefined : '.zip,application/zip,application/x-zip-compressed'}
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) {
                  historyImport.select(filePick(file))
                }
              }}
            />
          </>
        }
      />
      {historyImport.busy ? (
        <div className={styles.importProgress}>
          <div
            className={clsx(
              styles.importProgressTrack,
              loading && styles.importProgressIndeterminate
            )}
          >
            <div
              className={styles.importProgressFill}
              style={loading ? undefined : { width: `${percent}%` }}
            />
          </div>
          <div className={styles.importProgressRow}>
            <span className={styles.importProgressText}>{statusText}</span>
            <div className={styles.importProgressActions}>
              <Button
                variant="outlined"
                size="s"
                disabled={locked}
                onClick={() =>
                  historyImport.paused ? historyImport.resume() : historyImport.pause()
                }
              >
                {historyImport.paused ? t('historyImportResume') : t('historyImportPause')}
              </Button>
              <Button variant="outlined" size="s" disabled={locked} onClick={() => historyImport.abort()}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** 将全部会话及图片导出为 ZIP 文件并下载 */
const ExportHistory = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const empty = useChatStore((state) => state.sessions.length === 0)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { name, blob } = await exportHistory()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setStatus(errorStatus('historyExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('exportAllLabel')}
      description={t('historyExportDescription')}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy || empty}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t('exportAllDownload')}
        </Button>
      }
    />
  )
}

/** 导出个性化备份：设置、记忆、人格预设与头像（不含对话与 API Key） */
const ExportProfile = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)

  const onExport = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const { name, blob } = await exportProfile()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) {
      setStatus(errorStatus('profileBackupExportFailed', error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('profileBackupExport')}
      description={t('profileBackupExportDescription')}
      status={status}
      action={
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={disabled || busy}
          onClick={() => void onExport()}
        >
          <IconDownloadOutline16 />
          {t('exportAllDownload')}
        </Button>
      }
    />
  )
}

/** 导入个性化备份：设置直接覆盖，记忆与人格按 id 合并，头像覆盖 */
const ImportProfile = ({ disabled }: { disabled: boolean }) => {
  const t = useTranslate()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    setBusy(true)
    setStatus(null)
    try {
      const result = await importProfile(file)
      setStatus({
        key: 'profileBackupImported',
        params: { memories: result.memories, presets: result.presets },
      })
    } catch {
      setStatus({ key: 'profileBackupImportFailed', error: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingCell
      label={t('profileBackupImport')}
      description={t('profileBackupImportDescription')}
      status={status}
      action={
        <>
          <Button
            variant="outlined"
            size="m"
            className={styles.cellButton}
            disabled={disabled || busy}
            onClick={() => inputRef.current?.click()}
          >
            <IconUploadOutline14 />
            {t('upload')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => void onFiles(event)}
          />
        </>
      }
    />
  )
}
