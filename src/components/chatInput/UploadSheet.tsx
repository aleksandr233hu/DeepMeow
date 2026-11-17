import { useRef, type ChangeEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DOCUMENT_ACCEPT } from '../../services/uploadExts.js'
import { IconCameraOutline24, IconFileOutline24, IconImageOutline24 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import type { TranslationKey } from '../../i18n/index.js'
import styles from './UploadSheet.module.css'

/** 底部上传面板：拍照 / 相册 / 文件三种来源分开打开，避免所有类型混在一个选择器里。 */
export const UploadSheet = ({
  open,
  onClose,
  onFiles,
}: {
  open: boolean
  onClose: () => void
  onFiles: (files: File[]) => void
}) => {
  const t = useTranslate()
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!open) {
    return null
  }

  const handle = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    onClose()
    if (files.length > 0) {
      onFiles(files)
    }
  }

  const actions: { key: TranslationKey; icon: ReactNode; input: typeof cameraRef }[] = [
    { key: 'uploadCamera', icon: <IconCameraOutline24 />, input: cameraRef },
    { key: 'uploadGallery', icon: <IconImageOutline24 />, input: galleryRef },
    { key: 'uploadFiles', icon: <IconFileOutline24 />, input: fileRef },
  ]

  return createPortal(
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label={t('uploadFile')}>
      <button type="button" className={styles.backdrop} aria-label={t('cancel')} onClick={onClose} />
      <div className={styles.sheet}>
        <div className={styles.actions}>
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              className={styles.action}
              onClick={() => action.input.current?.click()}
            >
              {action.icon}
              <span>{t(action.key)}</span>
            </button>
          ))}
        </div>
        {/* 拍照直接调起系统相机；相册只列图片；文件排除图片，文档与代码都在这里 */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={handle}
        />
        <input ref={galleryRef} type="file" accept="image/*" multiple hidden onChange={handle} />
        <input
          ref={fileRef}
          type="file"
          accept={DOCUMENT_ACCEPT}
          multiple
          hidden
          onChange={handle}
        />
      </div>
    </div>,
    document.body
  )
}
