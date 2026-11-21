import { useTranslate } from '../../i18n/index.js'
import deepmeowAvatar from '../../assets/images/deepmeow-avatar.png'
import { useAvatarObjectUrl } from '../../services/avatar/store.js'
import { useSettings } from '../../services/settings.js'
import styles from './MessageAvatar.module.css'

/** 用户与助手头像：优先自定义图片；助手自定义头像时加猫耳，默认猫图标本身带耳朵，用户头像不带 */
export const MessageAvatar = ({
  role,
  thinking = false,
}: {
  role: 'user' | 'assistant'
  /** 思考/生成中：整只头像轻微摆动 */
  thinking?: boolean
}) => {
  const t = useTranslate()
  const nickname = useSettings((state) => state.nickname)
  const imageUrl = useAvatarObjectUrl(role)
  const label = nickname.trim().slice(0, 1) || t('you')
  return (
    <span
      className={styles.wrap}
      data-role={role}
      data-thinking={thinking ? 'true' : undefined}
    >
      {role === 'assistant' && imageUrl ? <span className={styles.ears} aria-hidden /> : null}
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
