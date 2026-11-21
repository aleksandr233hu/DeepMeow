import clsx from 'clsx'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconEllipsisOutline16,
  IconNewChatOutline16,
  IconPanelLeftOutline16,
  IconCatTail16,
  IconPaw16,
  IconSelectOutline16,
  IconSettingsOutline16,
} from '../base/icons.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { groupSessions } from '../../services/chat/sessionGroups.js'
import {
  createSessionGroup,
  removeSessionGroup,
  renameSessionGroup,
  useSessionGroups,
} from '../../services/chat/groups.js'
import {
  newChat,
  removeSession,
  setSessionsGroup,
  setSessionsPinned,
  useChatStore,
} from '../../services/chat/store.js'
import type { SessionGroup, SessionSummary } from '../../services/chat/types.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { Modal } from '../base/Modal.js'
import { showToast } from '../base/toastState.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { closeMobileSider, useMobileSider } from './mobileSiderState.js'
import { SessionItem } from './SessionItem.js'
import styles from './Sider.module.css'

/** 展开的侧边栏：名称与收起按钮、开启新对话、按时间分组的会话列表、底部设置；移动端放在抽屉里，收起按钮关闭抽屉 */
export const Sider = ({ mobile = false }: { mobile?: boolean }) => {
  const t = useTranslate()
  const sessions = useChatStore((state) => state.sessions)
  const activeId = useChatStore((state) => state.activeId)
  const [now, setNow] = useState(Date.now)
  const sessionGroups = useSessionGroups((state) => state.groups)
  const groupIds = useMemo(() => new Set(sessionGroups.map((group) => group.id)), [sessionGroups])
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set())
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [batchPending, setBatchPending] = useState(false)
  const [groupPickerOpen, setGroupPickerOpen] = useState(false)
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false)

  const sessionById = useMemo(
    () => new Map(sessions.map((session) => [session.id, session])),
    [sessions]
  )
  // 置顶与分组互不影响：置顶组收录所有置顶会话，归入分组的置顶会话在分组里照常显示
  const pinnedSessions = useMemo(
    () => sessions.filter((session) => session.pinned),
    [sessions]
  )
  // 时间分组只收未置顶、也不在自定义分组里的会话，避免与上面两处重复
  const restSessions = useMemo(
    () =>
      sessions.filter(
        (session) => !session.pinned && !(session.groupId && groupIds.has(session.groupId))
      ),
    [sessions, groupIds]
  )
  const groups = useMemo(() => groupSessions(restSessions, now, t), [restSessions, now, t])

  // 当前实际显示在侧栏里的会话（折叠的分组不计入），作为「全选」的范围
  const visibleIds = useMemo(() => {
    const ids: string[] = []
    if (pinnedOpen) {
      ids.push(...pinnedSessions.map((session) => session.id))
    }
    for (const group of sessionGroups) {
      if (collapsedGroups.has(group.id)) {
        continue
      }
      for (const session of sessions) {
        if (session.groupId === group.id) {
          ids.push(session.id)
        }
      }
    }
    ids.push(...restSessions.map((session) => session.id))
    return [...new Set(ids)]
  }, [pinnedOpen, pinnedSessions, sessionGroups, collapsedGroups, sessions, restSessions])

  const selectedCount = selected.size
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
  const selectedSessions = useMemo(
    () =>
      [...selected]
        .map((id) => sessionById.get(id))
        .filter((session): session is SessionSummary => Boolean(session)),
    [selected, sessionById]
  )
  const allSelectedPinned = selectedSessions.length > 0 && selectedSessions.every((s) => s.pinned)
  const hasGroupedSelected = selectedSessions.some((session) => session.groupId)

  // 会话被别处删掉后，把失效的勾选清理掉
  useEffect(() => {
    if (!selecting) {
      return
    }
    setSelected((current) => {
      if (current.size === 0) {
        return current
      }
      const next = new Set([...current].filter((id) => sessionById.has(id)))
      return next.size === current.size ? current : next
    })
  }, [selecting, sessionById])

  const toggleGroup = (id: string) => {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const startSelecting = () => {
    setSelected(new Set())
    setSelecting(true)
  }

  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
    setGroupPickerOpen(false)
    setBatchDeleteOpen(false)
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
      const isAll = visibleIds.length > 0 && visibleIds.every((id) => current.has(id))
      return isAll ? new Set() : new Set([...current, ...visibleIds])
    })
  }

  const toggleBatchPin = () => {
    if (selectedCount === 0 || batchPending) {
      return
    }
    setSessionsPinned([...selected], !allSelectedPinned)
  }

  const applyBatchGroup = (groupId: string | null) => {
    if (selectedCount === 0 || batchPending) {
      return
    }
    setSessionsGroup([...selected], groupId)
    setGroupPickerOpen(false)
    showToast({ key: groupId ? 'groupMoved' : 'groupRemoved' })
  }

  const deleteSelected = async () => {
    if (selectedCount === 0 || batchPending) {
      return
    }
    const ids = [...selected]
    setBatchPending(true)
    let failed = 0
    for (const id of ids) {
      if (!(await removeSession(id))) {
        failed += 1
      }
    }
    setBatchPending(false)
    exitSelecting()
    if (failed > 0) {
      showToast({ key: 'batchDeleteFailed', params: { count: failed }, type: 'error' })
    } else {
      showToast({ key: 'sessionsDeleted', params: { count: ids.length } })
    }
  }

  // 连点 5 次侧栏 logo：猫打个哈欠
  const brandClicks = useRef<number[]>([])
  const [brandYawn, setBrandYawn] = useState(false)
  const onBrandClick = () => {
    const now = Date.now()
    brandClicks.current = [...brandClicks.current.filter((time) => now - time < 1500), now]
    if (brandClicks.current.length >= 5) {
      brandClicks.current = []
      setBrandYawn(true)
      window.setTimeout(() => setBrandYawn(false), 1400)
    }
  }
  const [groupDialog, setGroupDialog] = useState<{
    id: string | null
    name: string
    /** 从批量分组弹窗新建：创建后把选中的会话都移进去 */
    applyToSelection?: boolean
  } | null>(null)
  const [groupPending, setGroupPending] = useState(false)

  const saveGroup = async () => {
    const dialog = groupDialog
    if (!dialog || groupPending) {
      return
    }
    const name = dialog.name.trim()
    if (!name) {
      return
    }
    setGroupPending(true)
    let ok = false
    let createdId: string | null = null
    if (dialog.id) {
      ok = await renameSessionGroup(dialog.id, name)
    } else {
      const created = await createSessionGroup(name)
      ok = created !== null
      createdId = created?.id ?? null
    }
    setGroupPending(false)
    if (!ok) {
      showToast({ key: 'groupSaveFailed', type: 'error' })
      return
    }
    if (createdId && dialog.applyToSelection && selected.size > 0) {
      setSessionsGroup([...selected], createdId)
      showToast({ key: 'groupMoved' })
    }
    setGroupDialog(null)
  }

  const deleteGroup = async (group: SessionGroup) => {
    if (await removeSessionGroup(group.id)) {
      showToast({ key: 'groupDeleted' })
    } else {
      showToast({ key: 'groupDeleteFailed', type: 'error' })
    }
  }
  const [deleting, setDeleting] = useState<SessionSummary | null>(null)
  const [deletePending, setDeletePending] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => {
      clearTimeout(timer)
      const time = Date.now()
      setNow(time)
      const midnight = new Date(time).setHours(24, 0, 0, 0)
      timer = setTimeout(refresh, midnight - time)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }
    refresh()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('focus', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  const renderSession = (session: SessionSummary) => (
    <SessionItem
      key={session.id}
      session={session}
      active={session.id === activeId}
      onDelete={() => setDeleting(session)}
      selecting={selecting}
      selected={selected.has(session.id)}
      onToggleSelect={() => toggleSelected(session.id)}
    />
  )

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <div
          className={clsx(styles.brand, brandYawn && styles.brandYawn)}
          onClick={onBrandClick}
        >
          <span className={styles.brandPaw}>
            <IconPaw16 />
          </span>
          <div className={styles.appName}>{t('appName')}</div>
          {brandYawn ? <span className={styles.yawnBubble}>{t('brandYawn')}</span> : null}
        </div>
        <IconButton
          size="m"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('collapseSiderbarButton')}
          tooltipPlacement="bottom"
          onClick={() => (mobile ? closeMobileSider() : setSiderCollapsed(true))}
        />
      </div>
      <button
        type="button"
        className={styles.newChat}
        onClick={() => {
          newChat()
          closeMobileSider()
        }}
      >
        <span className={styles.newChatIcon}>
          <IconPaw16 />
        </span>
        {t('newChat')}
      </button>
      <button
        type="button"
        className={styles.newGroup}
        onClick={() => setGroupDialog({ id: null, name: '' })}
      >
        <span className={styles.newGroupIcon}>
          <IconNewChatOutline16 />
        </span>
        {t('groupNew')}
      </button>
      <button
        type="button"
        className={clsx(styles.newGroup, selecting && styles.newGroupActive)}
        onClick={selecting ? exitSelecting : startSelecting}
      >
        <span className={styles.newGroupIcon}>
          <IconSelectOutline16 />
        </span>
        {selecting ? t('exitSelectMode') : t('selectMode')}
      </button>
      <div className={styles.listWrap}>
        <div className={styles.list}>
          {pinnedSessions.length > 0 ? (
            <div className={styles.section}>
              <button
                type="button"
                className={clsx(styles.sectionHeader, styles.sectionToggle)}
                aria-expanded={pinnedOpen}
                onClick={() => setPinnedOpen((value) => !value)}
              >
                <span className={styles.pinnedLabel}>
                  {t('sessionPinnedGroup')}
                  <span className={styles.pinnedTail} aria-hidden>
                    <IconCatTail16 />
                  </span>
                </span>
                <span className={styles.sectionChevron}>{pinnedOpen ? '▾' : '▸'}</span>
              </button>
              {pinnedOpen ? pinnedSessions.map(renderSession) : null}
            </div>
          ) : null}
          {sessionGroups.map((group) => {
            const items = sessions.filter((session) => session.groupId === group.id)
            const open = !collapsedGroups.has(group.id)
            return (
              <div key={group.id} className={styles.section}>
                <div className={styles.groupHeader}>
                  <button
                    type="button"
                    className={clsx(styles.sectionHeader, styles.sectionToggle)}
                    aria-expanded={open}
                    onClick={() => toggleGroup(group.id)}
                  >
                    <span>{group.name}</span>
                    <span className={styles.sectionChevron}>{open ? '▾' : '▸'}</span>
                  </button>
                  <Menu
                    options={[
                      {
                        key: 'rename',
                        label: t('groupRename'),
                        onSelect: () => setGroupDialog({ id: group.id, name: group.name }),
                      },
                      {
                        key: 'delete',
                        label: t('groupDelete'),
                        danger: true,
                        onSelect: () => void deleteGroup(group),
                      },
                    ]}
                  >
                    {({ toggle }) => (
                      <IconButton
                        icon={<IconEllipsisOutline16 />}
                        aria-label={t('more')}
                        onClick={toggle}
                      />
                    )}
                  </Menu>
                </div>
                {open ? items.map(renderSession) : null}
                {open && items.length === 0 ? (
                  <div className={styles.groupEmpty}>{t('groupEmpty')}</div>
                ) : null}
              </div>
            )
          })}
          {groups.map((group) => (
            <div key={group.key} className={styles.section}>
              <div className={styles.sectionHeader}>{group.label}</div>
              {group.sessions.map(renderSession)}
            </div>
          ))}
        </div>
      </div>
      {selecting ? (
        <div className={styles.selectBar}>
          <div className={styles.selectRow}>
            <span className={styles.selectCount}>
              {t('selectedCount', { count: selectedCount })}
            </span>
            <button type="button" className={styles.selectLink} onClick={toggleSelectAll}>
              {allSelected ? t('selectNone') : t('selectAll')}
            </button>
            <button type="button" className={styles.selectLink} onClick={exitSelecting}>
              {t('exitSelectMode')}
            </button>
          </div>
          <div className={styles.selectActions}>
            <Button
              size="s"
              variant="outlined"
              disabled={selectedCount === 0 || batchPending}
              onClick={toggleBatchPin}
            >
              {allSelectedPinned ? t('sessionUnpin') : t('sessionPin')}
            </Button>
            <Button
              size="s"
              variant="outlined"
              disabled={selectedCount === 0 || batchPending}
              onClick={() => setGroupPickerOpen(true)}
            >
              {t('groupMoveTo')}
            </Button>
            <Button
              size="s"
              variant="dangerOutlined"
              disabled={selectedCount === 0 || batchPending}
              onClick={() => setBatchDeleteOpen(true)}
            >
              {t('delete')}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.bottom}>
          <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
            <span className={styles.settingsIcon}>
              <IconSettingsOutline16 />
            </span>
            <span className={styles.settingsLabel}>{t('settings')}</span>
          </button>
        </div>
      )}
      {deleting ? (
        <Modal
          title={t('deleteSessionModalContentTitle')}
          onClose={() => {
            if (!deletePending) {
              setDeleting(null)
            }
          }}
          footer={
            <>
              <Button variant="outlined" disabled={deletePending} onClick={() => setDeleting(null)}>
                {t('cancel')}
              </Button>
              <Button
                variant="danger"
                disabled={deletePending}
                onClick={async () => {
                  setDeletePending(true)
                  try {
                    if (await removeSession(deleting.id)) {
                      setDeleting(null)
                    } else {
                      showToast({ key: 'sessionDeleteFailed', type: 'error' })
                    }
                  } finally {
                    setDeletePending(false)
                  }
                }}
              >
                {t('delete')}
              </Button>
            </>
          }
        >
          {t('deleteSessionWithFilesDescription')}
        </Modal>
      ) : null}
      {batchDeleteOpen ? (
        <Modal
          title={t('batchDeleteTitle', { count: selectedCount })}
          onClose={() => {
            if (!batchPending) {
              setBatchDeleteOpen(false)
            }
          }}
          footer={
            <>
              <Button
                variant="outlined"
                disabled={batchPending}
                onClick={() => setBatchDeleteOpen(false)}
              >
                {t('cancel')}
              </Button>
              <Button variant="danger" disabled={batchPending} onClick={() => void deleteSelected()}>
                {batchPending ? t('batchDeleting') : t('delete')}
              </Button>
            </>
          }
        >
          {t('batchDeleteDescription')}
        </Modal>
      ) : null}
      {groupPickerOpen ? (
        <Modal
          title={t('groupMoveTo')}
          onClose={() => {
            if (!batchPending) {
              setGroupPickerOpen(false)
            }
          }}
          footer={
            <Button variant="outlined" onClick={() => setGroupPickerOpen(false)}>
              {t('cancel')}
            </Button>
          }
        >
          <div className={styles.groupPicker}>
            {sessionGroups.map((group) => (
              <button
                key={group.id}
                type="button"
                className={styles.groupPickerItem}
                onClick={() => applyBatchGroup(group.id)}
              >
                {group.name}
              </button>
            ))}
            {hasGroupedSelected ? (
              <button
                type="button"
                className={styles.groupPickerItem}
                onClick={() => applyBatchGroup(null)}
              >
                {t('groupUngroup')}
              </button>
            ) : null}
            <button
              type="button"
              className={clsx(styles.groupPickerItem, styles.groupPickerCreate)}
              onClick={() => {
                setGroupPickerOpen(false)
                setGroupDialog({ id: null, name: '', applyToSelection: true })
              }}
            >
              <IconNewChatOutline16 />
              {t('groupNew')}
            </button>
          </div>
        </Modal>
      ) : null}
      {groupDialog ? (
        <Modal
          title={t(groupDialog.id ? 'groupRename' : 'groupNew')}
          onClose={() => setGroupDialog(null)}
          footer={
            <>
              <Button
                variant="outlined"
                disabled={groupPending}
                onClick={() => setGroupDialog(null)}
              >
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={groupPending || !groupDialog.name.trim()}
                onClick={() => void saveGroup()}
              >
                {t('confirm')}
              </Button>
            </>
          }
        >
          <input
            className={styles.groupInput}
            autoFocus
            maxLength={30}
            placeholder={t('groupNamePlaceholder')}
            value={groupDialog.name}
            onChange={(event) => setGroupDialog({ ...groupDialog, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                void saveGroup()
              }
            }}
          />
        </Modal>
      ) : null}
    </div>
  )
}

/** 移动端抽屉：浮在页面上方，点空白区域关闭。 */
export const MobileSider = () => {
  const open = useMobileSider((state) => state.open)
  if (!open) {
    return null
  }
  return (
    <>
      <div className={styles.drawerMask} onClick={closeMobileSider} />
      <div className={styles.drawer}>
        <Sider mobile />
      </div>
    </>
  )
}
