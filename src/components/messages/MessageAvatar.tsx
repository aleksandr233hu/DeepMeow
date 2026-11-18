import { useTranslate } from '../../i18n/index.js'
import deepmeowAvatar from '../../assets/images/deepmeow-avatar.png'
import { useAvatarObjectUrl } from '../../services/avatar/store.js'
import { useSettings } from '../../services/settings.js'
import styles from './MessageAvatar.module.css'

/** 用户与助手头像：优先自定义图片；助手默认使用应用图标（猫吉祥物），用户头像带小猫耳 */
export const MessageAvatar = ({ role }: { role: 'user' | 'assistant' }) => {
  const t = useTranslate()
  const nickname = useSettings((state) => state.nickname)
  const imageUrl = useAvatarObjectUrl(role)
  const label = nickname.trim().slice(0, 1) || t('you')
  return (
    <span className={styles.wrap} data-role={role}>
      {role === 'user' ? <span className={styles.ears} aria-hidden /> : null}
      <span
        className={styles.avatar}
        data-role={role}
        role="img"
        aria-label={role === 'assistant' ? t('assistantName') : t('you')}
      >
        {imageUrl ? (
          <img className={styles.image} src={imageUrl} alt="" />
        ) : role === 'assistant' ? (
          <img className={styles.logo} src={deepmeowAvatar} alt="" />
        ) : (
          label
        )}
      </span>
    </span>
  )
}
