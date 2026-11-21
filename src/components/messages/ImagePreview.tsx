import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslate } from '../../i18n/index.js'
import { loadFile } from '../../services/chat/db.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { closeImagePreview, useImagePreview } from './imagePreviewState.js'
import styles from './ImagePreview.module.css'

/** 聊天图片的全屏预览：关闭按钮、点背景、Esc 与系统返回键都能退出 */
export const ImagePreview = () => {
  const t = useTranslate()
  const image = useImagePreview((state) => state.image)
  const [url, setUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  const close = useCallback(() => {
    closeImagePreview()
    if (window.history.state?.imagePreview === true) {
      window.history.back()
    }
  }, [])

  useEffect(() => {
    if (!image) {
      setUrl(null)
      setMissing(false)
      return
    }
    let objectUrl: string | null = null
    let cancelled = false
    loadFile(image.id).then((blob) => {
      if (cancelled) {
        return
      }
      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } else {
        setMissing(true)
      }
    })
    return () => {
      cancelled = true
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [image])

  useEffect(() => {
    if (!image) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
      }
    }
    const onPopState = () => {
      // 关闭按钮已经清空时不再重复处理
      if (useImagePreview.getState().image) {
        closeImagePreview()
      }
    }
    // 移动端系统返回键：压入一条历史记录，返回时只关预览，不退出应用
    window.history.pushState({ imagePreview: true }, '')
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('popstate', onPopState)
    }
  }, [image, close])

  if (!image) {
    return null
  }

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close()
        }
      }}
    >
      <button type="button" className={styles.close} aria-label={t('close')} onClick={close}>
        <IconCloseOutline16 />
      </button>
      <div className={styles.stage} onMouseDown={(event) => event.stopPropagation()}>
        {missing ? (
          <div className={styles.missing}>{t('imagePreviewMissing')}</div>
        ) : url ? (
          <img className={styles.image} src={url} alt={image.name} />
        ) : null}
      </div>
    </div>,
    document.body
  )
}
