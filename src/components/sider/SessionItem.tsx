import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconCheckOutline16,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconPaw16,
  IconTrashOutline16,
} from '../base/icons.js'
import {
  renameSession,
  selectSession,
  setSessionGroup,
  setSessionPinned,
} from '../../services/chat/store.js'
import { useSessionGroups } from '../../services/chat/groups.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu } from '../base/Menu.js'
import { showToast } from '../base/toastState.js'
import { closeMobileSider } from './mobileSiderState.js'
import styles from './SessionItem.module.css'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  onDelete,
  selecting = false,
  selected = false,
  onToggleSelect,
}: {
  session: SessionSummary
  active: boolean
  onDelete: () => void
  /** 多选模式：整行点击切换勾选，不打开会话，也不显示右侧菜单 */
  selecting?: boolean
  selected?: boolean
  onToggleSelect?: () => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const groups = useSessionGroups((state) => state.groups)
  const displayTitle = session.title || t('untitledChat')
  const moveToGroup = (groupId: string | null) => {
    setSessionGroup(session.id, groupId)
    showToast({ key: 'groupMoved' })
  }

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <div
      className={clsx(
        styles.item,
        selected && styles.selected,
        active && !selecting && styles.active
      )}
      role={selecting ? 'checkbox' : undefined}
      aria-checked={selecting ? selected : undefined}
      onClick={() => {
        if (selecting) {
          onToggleSelect?.()
          return
        }
        selectSession(session.id)
        closeMobileSider()
      }}
    >
      {selecting ? (
        <span className={clsx(styles.checkbox, selected && styles.checkboxChecked)}>
          {selected ? <IconCheckOutline16 /> : null}
        </span>
      ) : null}
      <div className={styles.title}>{displayTitle}</div>
      {selecting ? null : (
        <div className={styles.action} onClick={(event) => event.stopPropagation()}>
          <Menu
            options={[
              {
                key: 'pin',
                label: session.pinned ? t('sessionUnpin') : t('sessionPin'),
                icon: <IconPaw16 />,
                onSelect: () => setSessionPinned(session.id, !session.pinned),
              },
              {
                key: 'rename',
                label: t('sessionItemMenuRenameOption'),
                icon: <IconEditOutline16 />,
                onSelect: () => setEditing(true),
              },
              ...groups.map((group) => ({
                key: `group-${group.id}`,
                label:
                  session.groupId === group.id
                    ? `✓ ${group.name}`
                    : `${t('groupMoveTo')}：${group.name}`,
                onSelect: () => moveToGroup(group.id),
              })),
              ...(session.groupId
                ? [
                    {
                      key: 'ungroup',
                      label: t('groupUngroup'),
                      onSelect: () => moveToGroup(null),
                    },
                  ]
                : []),
              {
                key: 'delete',
                label: t('delete'),
                icon: <IconTrashOutline16 />,
                danger: true,
                onSelect: onDelete,
              },
            ]}
          >
            {({ toggle }) => (
              <IconButton icon={<IconEllipsisOutline16 />} aria-label={t('more')} onClick={toggle} />
            )}
          </Menu>
        </div>
      )}
    </div>
  )
})
