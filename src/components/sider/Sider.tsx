import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconEllipsisOutline16,
  IconNewChatOutline16,
  IconPanelLeftOutline16,
  IconPaw16,
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
import { newChat, removeSession, useChatStore } from '../../services/chat/store.js'
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
  // 分组归类优先：归入分组的会话只在分组里出现，置顶组与时间分组都不再重复
  const isGrouped = (session: SessionSummary) =>
    Boolean(session.groupId && groupIds.has(session.groupId))
  const pinnedSessions = useMemo(
    () => sessions.filter((session) => session.pinned && !isGrouped(session)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, groupIds]
  )
  const restSessions = useMemo(
    () => sessions.filter((session) => !session.pinned && !isGrouped(session)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions, groupIds]
  )
  const groups = useMemo(() => groupSessions(restSessions, now, t), [restSessions, now, t])
  const [pinnedOpen, setPinnedOpen] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set())
  const [groupDialog, setGroupDialog] = useState<{ id: string | null; name: string } | null>(null)
  const [groupPending, setGroupPending] = useState(false)

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

  const saveGroup = async () => {
    if (!groupDialog || groupPending) {
      return
    }
    const name = groupDialog.name.trim()
    if (!name) {
      return
    }
    setGroupPending(true)
    const ok = groupDialog.id
      ? await renameSessionGroup(groupDialog.id, name)
      : (await createSessionGroup(name)) !== null
    setGroupPending(false)
    if (ok) {
      setGroupDialog(null)
    } else {
      showToast({ key: 'groupSaveFailed', type: 'error' })
    }
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

  return (
    <div className={clsx(styles.sider, mobile && styles.mobile)}>
      <div className={styles.top}>
        <div className={styles.brand}>
          <span className={styles.brandPaw}>
            <IconPaw16 />
          </span>
          <div className={styles.appName}>{t('appName')}</div>
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
                <span>{t('sessionPinnedGroup')}</span>
                <span className={styles.sectionChevron}>{pinnedOpen ? '▾' : '▸'}</span>
              </button>
              {pinnedOpen
                ? pinnedSessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      active={session.id === activeId}
                      onDelete={() => setDeleting(session)}
                    />
                  ))
                : null}
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
                {open
                  ? items.map((session) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        active={session.id === activeId}
                        onDelete={() => setDeleting(session)}
                      />
                    ))
                  : null}
                {open && items.length === 0 ? (
                  <div className={styles.groupEmpty}>{t('groupEmpty')}</div>
                ) : null}
              </div>
            )
          })}
          {groups.map((group) => (
            <div key={group.key} className={styles.section}>
              <div className={styles.sectionHeader}>{group.label}</div>
              {group.sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  active={session.id === activeId}
                  onDelete={() => setDeleting(session)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.settings} onClick={() => openSettings('general')}>
          <span className={styles.settingsIcon}>
            <IconSettingsOutline16 />
          </span>
          <span className={styles.settingsLabel}>{t('settings')}</span>
        </button>
      </div>
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
