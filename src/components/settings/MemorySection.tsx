import { useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  addMemory,
  removeMemory,
  removeMemories,
  updateMemory,
  useMemoryStore,
  VERSION_MEMORY_ID,
} from '../../services/memory/store.js'
import { summarizeSessionToMemory, type SummaryScope } from '../../services/memory/summarize.js'
import type { MemoryRecord, MemorySource } from '../../services/memory/types.js'
import { loadSessionForTask, useChatStore } from '../../services/chat/store.js'
import {
  setAutoMemoryEnabled,
  setAutoMemoryRounds,
  setMemoryEnabled,
  useSettings,
} from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { Toggle } from '../base/Toggle.js'
import { IconCheckOutline16, IconEditOutline16, IconTrashOutline16 } from '../base/icons.js'
import { showToast } from '../base/toastState.js'
import { SettingCell } from './SettingCell.js'
import styles from './MemorySection.module.css'

const SOURCE_LABEL: Record<MemorySource, 'memorySourceAuto' | 'memorySourceManual' | 'memorySourceSummary'> =
  {
    auto: 'memorySourceAuto',
    manual: 'memorySourceManual',
    summary: 'memorySourceSummary',
  }

const ROUND_OPTIONS = Array.from({ length: 10 }, (_, index) => String(index + 1))

/** 长期记忆管理：总开关、自动提取、手动新增、会话总结与批量删除 */
export const MemorySection = () => {
  const t = useTranslate()
  const memories = useMemoryStore((state) => state.memories)
  const memoryEnabled = useSettings((state) => state.memoryEnabled)
  const autoMemoryEnabled = useSettings((state) => state.autoMemoryEnabled)
  const autoMemoryRounds = useSettings((state) => state.autoMemoryRounds)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [batchPending, setBatchPending] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)

  const selectable = memories.filter((memory) => memory.id !== VERSION_MEMORY_ID)
  const allSelected = selectable.length > 0 && selectable.every((memory) => selected.has(memory.id))

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

  const toggleSelected = (id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelected((current) => {
      const isAll = selectable.length > 0 && selectable.every((memory) => current.has(memory.id))
      return isAll ? new Set() : new Set(selectable.map((memory) => memory.id))
    })
  }

  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const deleteSelected = async () => {
    if (batchPending || selected.size === 0) {
      return
    }
    const ids = [...selected]
    setBatchPending(true)
    const removed = await removeMemories(ids)
    setBatchPending(false)
    setConfirmDelete(false)
    setSelected(new Set())
    if (removed === ids.length) {
      showToast({ key: 'memoriesDeleted', params: { count: removed } })
    } else {
      showToast({
        key: 'memoriesDeleteFailed',
        params: { count: ids.length - removed },
        type: 'error',
      })
    }
  }

  const sourceLabel = (memory: MemoryRecord) =>
    memory.id === VERSION_MEMORY_ID
      ? t('memorySourceVersion')
      : t(SOURCE_LABEL[memory.source])

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
      <SettingCell
        label={t('autoMemoryRounds')}
        description={t('autoMemoryRoundsDescription')}
        status={null}
        action={
          <Select
            ariaLabel={t('autoMemoryRounds')}
            value={String(autoMemoryRounds)}
            disabled={!memoryEnabled || !autoMemoryEnabled}
            options={ROUND_OPTIONS.map((value) => ({
              value,
              label: t('autoMemoryRoundsValue', { count: value }),
            }))}
            onChange={(value) => setAutoMemoryRounds(Number(value))}
          />
        }
      />

      <div className={styles.listHeader}>
        <div className={styles.sectionTitle}>
          {t('memoryListTitle', { count: memories.length })}
        </div>
        <div className={styles.listActions}>
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => setSummaryOpen(true)}
          >
            {t('memorySummaryAction')}
          </button>
          <button
            type="button"
            className={styles.linkButton}
            onClick={selecting ? exitSelecting : () => setSelecting(true)}
          >
            {selecting ? t('exitSelectMode') : t('selectMode')}
          </button>
        </div>
      </div>

      {selecting ? (
        <div className={styles.batchBar}>
          <span className={styles.batchCount}>
            {t('selectedCount', { count: selected.size })}
          </span>
          <button type="button" className={styles.linkButton} onClick={toggleSelectAll}>
            {allSelected ? t('selectNone') : t('selectAll')}
          </button>
          <Button
            size="s"
            variant="dangerOutlined"
            disabled={selected.size === 0 || batchPending}
            onClick={() => setConfirmDelete(true)}
          >
            {t('delete')}
          </Button>
        </div>
      ) : null}

      <div className={styles.addBox}>
        <textarea
          className={styles.textarea}
          rows={3}
          maxLength={2000}
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
          {memories.map((memory) => {
            const locked = memory.id === VERSION_MEMORY_ID
            return (
              <li
                key={memory.id}
                className={styles.item}
                onClick={selecting && !locked ? () => toggleSelected(memory.id) : undefined}
              >
                {selecting && !locked ? (
                  <span
                    className={
                      selected.has(memory.id)
                        ? `${styles.checkbox} ${styles.checkboxOn}`
                        : styles.checkbox
                    }
                    role="checkbox"
                    aria-checked={selected.has(memory.id)}
                    aria-label={memory.text.slice(0, 30)}
                  >
                    {selected.has(memory.id) ? <IconCheckOutline16 /> : null}
                  </span>
                ) : null}
                {editingId === memory.id ? (
                  <div className={styles.editor}>
                    <textarea
                      className={styles.textarea}
                      rows={4}
                      maxLength={2000}
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
                      <span className={styles.source}>{sourceLabel(memory)}</span>
                      {selecting ? null : (
                        <>
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
                        </>
                      )}
                    </div>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className={styles.hint}>{t('memoryHint')}</div>

      {confirmDelete ? (
        <Modal
          title={t('memoryBatchDeleteTitle', { count: selected.size })}
          onClose={() => {
            if (!batchPending) {
              setConfirmDelete(false)
            }
          }}
          footer={
            <>
              <Button
                variant="outlined"
                disabled={batchPending}
                onClick={() => setConfirmDelete(false)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={batchPending}
                onClick={() => void deleteSelected()}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('memoryBatchDeleteDescription')}
        </Modal>
      ) : null}

      {summaryOpen ? <MemorySummaryDialog onClose={() => setSummaryOpen(false)} /> : null}
    </>
  )
}

const SCOPE_OPTIONS: SummaryScope[] = ['full', 20, 50, 100]

const MemorySummaryDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const apiKey = useSettings((state) => state.apiKey)
  const [sessionId, setSessionId] = useState('')
  const [scope, setScope] = useState('full')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 只列最近 100 个会话，避免下拉菜单过长
  const options = sessions.slice(0, 100).map((session) => ({
    value: session.id,
    label: session.title || t('untitledChat'),
  }))

  const start = async () => {
    if (running) {
      return
    }
    if (!sessionId) {
      showToast({ key: 'memorySummaryNoSession', type: 'error' })
      return
    }
    if (!apiKey) {
      showToast({ key: 'memorySummaryNoKey', type: 'error' })
      return
    }
    setRunning(true)
    setProgress(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const session = await loadSessionForTask(sessionId)
      if (!session) {
        showToast({ key: 'memorySummaryFailed', type: 'error' })
        return
      }
      const summary = await summarizeSessionToMemory({
        session,
        apiKey,
        scope: (scope === 'full' ? 'full' : Number(scope)) as SummaryScope,
        onProgress: (done, total) => setProgress({ done, total }),
        signal: controller.signal,
      })
      if (!summary) {
        showToast({ key: 'memorySummaryEmpty', type: 'error' })
        return
      }
      if (await addMemory(summary, 'summary')) {
        showToast({ key: 'memorySummarySaved' })
        onClose()
      } else {
        showToast({ key: 'memorySummaryFailed', type: 'error' })
      }
    } catch {
      if (!controller.signal.aborted) {
        showToast({ key: 'memorySummaryFailed', type: 'error' })
      }
    } finally {
      abortRef.current = null
      setRunning(false)
      setProgress(null)
    }
  }

  return (
    <Modal
      title={t('memorySummaryTitle')}
      onClose={() => {
        abortRef.current?.abort()
        onClose()
      }}
      footer={
        <>
          <Button
            variant="outlined"
            disabled={running}
            onClick={() => {
              abortRef.current?.abort()
              onClose()
            }}
          >
            {t('cancel')}
          </Button>
          <Button disabled={running || !sessionId} onClick={() => void start()}>
            {running ? t('memorySummaryRunning') : t('memorySummaryStart')}
          </Button>
        </>
      }
    >
      <div className={styles.summaryBody}>
        <div className={styles.summaryDescription}>{t('memorySummaryDescription')}</div>
        <div className={styles.summaryField}>
          <div className={styles.summaryLabel}>{t('memorySummarySession')}</div>
          <Select
            ariaLabel={t('memorySummarySession')}
            value={sessionId}
            placeholder={t('memorySummarySessionPlaceholder')}
            options={options}
            onChange={setSessionId}
          />
        </div>
        <div className={styles.summaryField}>
          <div className={styles.summaryLabel}>{t('memorySummaryScope')}</div>
          <Select
            ariaLabel={t('memorySummaryScope')}
            value={scope}
            options={SCOPE_OPTIONS.map((value) => ({
              value: String(value),
              label:
                value === 'full'
                  ? t('memorySummaryScopeFull')
                  : t('memorySummaryScopeRecent', { count: value }),
            }))}
            onChange={setScope}
          />
        </div>
        {progress ? (
          <div className={styles.summaryProgress}>
            {t('memorySummaryProgress', { done: progress.done, total: progress.total })}
          </div>
        ) : null}
        <div className={styles.summaryHint}>{t('memorySummaryCostHint')}</div>
      </div>
    </Modal>
  )
}
