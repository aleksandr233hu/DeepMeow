import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  addMemory,
  removeMemory,
  updateMemory,
  useMemoryStore,
} from '../../services/memory/store.js'
import {
  setAutoMemoryEnabled,
  setMemoryEnabled,
  useSettings,
} from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Toggle } from '../base/Toggle.js'
import { IconEditOutline16, IconTrashOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { SettingCell } from './SettingCell.js'
import styles from './MemorySection.module.css'

/** 长期记忆管理：总开关、自动提取、手动新增与逐条编辑/启停/删除 */
export const MemorySection = () => {
  const t = useTranslate()
  const memories = useMemoryStore((state) => state.memories)
  const memoryEnabled = useSettings((state) => state.memoryEnabled)
  const autoMemoryEnabled = useSettings((state) => state.autoMemoryEnabled)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const add = async () => {
    if (!text.trim() || busy) {
      return
    }
    setBusy(true)
    const memory = await addMemory(text, 'manual')
    setBusy(false)
    if (memory) {
      setText('')
      showToast({ key: 'memorySaved' })
    } else {
      showToast({ key: 'memoryDuplicate', type: 'error' })
    }
  }

  const saveEdit = async () => {
    if (!editingId) {
      return
    }
    if (await updateMemory(editingId, { text: draft })) {
      setEditingId(null)
      showToast({ key: 'memoryUpdated' })
    } else {
      showToast({ key: 'memoryUpdateFailed', type: 'error' })
    }
  }

  const remove = async (id: string) => {
    if (await removeMemory(id)) {
      showToast({ key: 'memoryDeleted' })
    } else {
      showToast({ key: 'memoryDeleteFailed', type: 'error' })
    }
  }

  return (
    <>
      <SettingCell
        label={t('memoryEnabled')}
        description={t('memoryEnabledDescription')}
        status={null}
        action={
          <Toggle
            checked={memoryEnabled}
            label={t('memoryEnabled')}
            onChange={setMemoryEnabled}
          />
        }
      />
      <SettingCell
        label={t('autoMemoryEnabled')}
        description={t('autoMemoryEnabledDescription')}
        status={null}
        action={
          <Toggle
            checked={autoMemoryEnabled}
            label={t('autoMemoryEnabled')}
            disabled={!memoryEnabled}
            onChange={setAutoMemoryEnabled}
          />
        }
      />

      <div className={styles.sectionTitle}>
        {t('memoryListTitle', { count: memories.length })}
      </div>
      <div className={styles.addBox}>
        <textarea
          className={styles.textarea}
          rows={2}
          value={text}
          placeholder={t('memoryAddPlaceholder')}
          onChange={(event) => setText(event.target.value)}
        />
        <Button
          size="s"
          disabled={!text.trim() || busy}
          className={styles.addButton}
          onClick={() => void add()}
        >
          {t('addMemory')}
        </Button>
      </div>

      {memories.length === 0 ? (
        <div className={styles.empty}>{t('memoryEmpty')}</div>
      ) : (
        <ul className={styles.list}>
          {memories.map((memory) => (
            <li key={memory.id} className={styles.item}>
              {editingId === memory.id ? (
                <div className={styles.editor}>
                  <textarea
                    className={styles.textarea}
                    rows={2}
                    value={draft}
                    autoFocus
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <div className={styles.editorActions}>
                    <Button size="s" variant="outlined" onClick={() => setEditingId(null)}>
                      {t('cancel')}
                    </Button>
                    <Button size="s" disabled={!draft.trim()} onClick={() => void saveEdit()}>
                      {t('save')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.itemText}>{memory.text}</div>
                  <div className={styles.itemMeta}>
                    <span className={styles.source}>
                      {t(memory.source === 'auto' ? 'memorySourceAuto' : 'memorySourceManual')}
                    </span>
                    <Toggle
                      checked={memory.enabled}
                      label={t('memoryToggle')}
                      onChange={(enabled) => void updateMemory(memory.id, { enabled })}
                    />
                    <IconButton
                      icon={<IconEditOutline16 />}
                      tooltip={t('editMessage')}
                      tooltipPlacement="bottom"
                      onClick={() => {
                        setDraft(memory.text)
                        setEditingId(memory.id)
                      }}
                    />
                    <IconButton
                      icon={<IconTrashOutline16 />}
                      tooltip={t('delete')}
                      tooltipPlacement="bottom"
                      onClick={() => void remove(memory.id)}
                    />
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={styles.hint}>{t('memoryHint')}</div>
    </>
  )
}
