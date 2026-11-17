import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  addPreset,
  removePreset,
  updatePreset,
  usePresetStore,
} from '../../services/presets/store.js'
import type { Preset } from '../../services/presets/types.js'
import { setDefaultPresetId, useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Select } from '../base/Select.js'
import { IconCopyOutline16, IconEditOutline16, IconTrashOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { SettingCell } from './SettingCell.js'
import styles from './PresetsSection.module.css'

type Editor = { id: string | null; name: string; emoji: string; prompt: string }

/** 人格预设管理：默认人格、新建/编辑/复制/删除，内置人格不可删除 */
export const PresetsSection = () => {
  const t = useTranslate()
  const presets = usePresetStore((state) => state.presets)
  const defaultPresetId = useSettings((state) => state.defaultPresetId)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)

  const startCreate = () => setEditor({ id: null, name: '', emoji: '✨', prompt: '' })
  const startEdit = (preset: Preset) =>
    setEditor({ id: preset.id, name: preset.name, emoji: preset.emoji, prompt: preset.systemPrompt })

  const save = async () => {
    if (!editor || busy) {
      return
    }
    setBusy(true)
    const ok = editor.id
      ? await updatePreset(editor.id, {
          name: editor.name,
          emoji: editor.emoji,
          systemPrompt: editor.prompt,
        })
      : (await addPreset({
          name: editor.name,
          emoji: editor.emoji,
          systemPrompt: editor.prompt,
        })) !== null
    setBusy(false)
    if (ok) {
      setEditor(null)
      showToast({ key: 'presetSaved' })
    } else {
      showToast({ key: 'presetSaveFailed', type: 'error' })
    }
  }

  const duplicate = async (preset: Preset) => {
    const created = await addPreset({
      name: `${preset.name} 副本`,
      emoji: preset.emoji,
      systemPrompt: preset.systemPrompt,
    })
    showToast({ key: created ? 'presetSaved' : 'presetSaveFailed', type: created ? undefined : 'error' })
  }

  const remove = async (preset: Preset) => {
    if (await removePreset(preset.id)) {
      if (defaultPresetId === preset.id) {
        setDefaultPresetId(null)
      }
      showToast({ key: 'presetDeleted' })
    } else {
      showToast({ key: 'presetDeleteFailed', type: 'error' })
    }
  }

  return (
    <>
      <SettingCell
        label={t('presetDefault')}
        description={t('presetDefaultDescription')}
        status={null}
        action={
          <Select
            ariaLabel={t('presetDefault')}
            value={defaultPresetId ?? ''}
            options={[
              { value: '', label: t('presetFollowBuiltin') },
              ...presets.map((preset) => ({
                value: preset.id,
                label: `${preset.emoji} ${preset.name}`,
              })),
            ]}
            onChange={(value) => setDefaultPresetId(value || null)}
          />
        }
      />

      <div className={styles.header}>
        <div className={styles.title}>{t('presetsTitle')}</div>
        <Button size="s" variant="outlined" onClick={startCreate}>
          {t('newPreset')}
        </Button>
      </div>

      <ul className={styles.list}>
        {presets.map((preset) => (
          <li key={preset.id} className={styles.item}>
            <span className={styles.emoji}>{preset.emoji}</span>
            <div className={styles.info}>
              <div className={styles.name}>
                {preset.name}
                {preset.builtin ? (
                  <span className={styles.badge}>{t('presetBuiltin')}</span>
                ) : null}
              </div>
              <div className={styles.prompt}>{preset.systemPrompt}</div>
            </div>
            <div className={styles.actions}>
              <IconButton
                icon={<IconEditOutline16 />}
                tooltip={t('editPreset')}
                tooltipPlacement="bottom"
                onClick={() => startEdit(preset)}
              />
              <IconButton
                icon={<IconCopyOutline16 />}
                tooltip={t('duplicatePreset')}
                tooltipPlacement="bottom"
                onClick={() => void duplicate(preset)}
              />
              {preset.builtin ? null : (
                <IconButton
                  icon={<IconTrashOutline16 />}
                  tooltip={t('deletePreset')}
                  tooltipPlacement="bottom"
                  onClick={() => void remove(preset)}
                />
              )}
            </div>
          </li>
        ))}
      </ul>

      {editor ? (
        <div className={styles.editor}>
          <div className={styles.editorTitle}>
            {t(editor.id ? 'editPreset' : 'newPreset')}
          </div>
          <div className={styles.row}>
            <input
              className={styles.emojiInput}
              value={editor.emoji}
              maxLength={4}
              aria-label={t('presetEmoji')}
              onChange={(event) => setEditor({ ...editor, emoji: event.target.value })}
            />
            <input
              className={styles.input}
              value={editor.name}
              placeholder={t('presetNamePlaceholder')}
              aria-label={t('presetName')}
              onChange={(event) => setEditor({ ...editor, name: event.target.value })}
            />
          </div>
          <textarea
            className={styles.textarea}
            rows={5}
            value={editor.prompt}
            placeholder={t('presetPromptPlaceholder')}
            aria-label={t('presetPrompt')}
            onChange={(event) => setEditor({ ...editor, prompt: event.target.value })}
          />
          <div className={styles.editorActions}>
            <Button size="s" variant="outlined" onClick={() => setEditor(null)}>
              {t('cancel')}
            </Button>
            <Button
              size="s"
              disabled={busy || !editor.name.trim() || !editor.prompt.trim()}
              onClick={() => void save()}
            >
              {t('save')}
            </Button>
          </div>
        </div>
      ) : null}

      <div className={styles.hint}>{t('presetsHint')}</div>
    </>
  )
}
