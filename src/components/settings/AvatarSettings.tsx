import { useRef, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import deepmeowAvatar from '../../assets/images/deepmeow-avatar.png'
import {
  resetAvatar,
  saveAvatar,
  useAvatarObjectUrl,
  useAvatarStore,
  type SaveAvatarResult,
} from '../../services/avatar/store.js'
import type { AvatarRole } from '../../services/avatar/types.js'
import { useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'
import styles from './AvatarSettings.module.css'

const AVATAR_LABELS: Record<AvatarRole, 'userAvatar' | 'assistantAvatar'> = {
  user: 'userAvatar',
  assistant: 'assistantAvatar',
}

/** 用户 / 助手的本地头像上传与恢复默认 */
export const AvatarSettings = () => {
  const t = useTranslate()
  const nickname = useSettings((state) => state.nickname)

  return (
    <div className={styles.block}>
      <div className={styles.title}>{t('customAvatars')}</div>
      <div className={styles.description}>{t('customAvatarsDescription')}</div>
      <div className={styles.rows}>
        <AvatarRow role="user" fallback={nickname.trim().slice(0, 1) || t('you')} />
        <AvatarRow
          role="assistant"
          fallback={<img className={styles.image} src={deepmeowAvatar} alt="" />}
        />
      </div>
    </div>
  )
}

const AvatarRow = ({ role, fallback }: { role: AvatarRole; fallback: ReactNode }) => {
  const t = useTranslate()
  const inputRef = useRef<HTMLInputElement>(null)
  const imageUrl = useAvatarObjectUrl(role)
  const hasCustom = useAvatarStore((state) => state.avatars[role] !== undefined)

  const upload = async (file: File) => {
    const result: SaveAvatarResult = await saveAvatar(role, file)
    if (result === 'done') {
      showToast({ key: 'avatarSaved' })
      return
    }
    const key =
      result === 'type'
        ? 'avatarInvalidType'
        : result === 'size'
          ? 'avatarTooLarge'
          : result === 'decode'
            ? 'avatarDecodeFailed'
            : 'avatarSaveFailed'
    showToast({ key, type: 'error' })
  }

  const reset = async () => {
    if (await resetAvatar(role)) {
      showToast({ key: 'avatarReset' })
    } else {
      showToast({ key: 'avatarResetFailed', type: 'error' })
    }
  }

  return (
    <div className={styles.row}>
      <span className={styles.preview} data-role={role}>
        {imageUrl ? <img className={styles.image} src={imageUrl} alt="" /> : fallback}
      </span>
      <span className={styles.label}>{t(AVATAR_LABELS[role])}</span>
      <div className={styles.actions}>
        <Button size="s" variant="outlined" onClick={() => inputRef.current?.click()}>
          {t('uploadAvatar')}
        </Button>
        <Button size="s" variant="outlined" disabled={!hasCustom} onClick={() => void reset()}>
          {t('resetAvatar')}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) {
              void upload(file)
            }
          }}
        />
      </div>
    </div>
  )
}
