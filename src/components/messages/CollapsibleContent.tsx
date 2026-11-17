import clsx from 'clsx'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import styles from './CollapsibleContent.module.css'

/** 超过该像素高度时折叠，避免长回答占满屏幕 */
const COLLAPSE_HEIGHT = 420

/** 长内容折叠：流式结束后再判断高度，展开状态只保存在组件内 */
export const CollapsibleContent = ({
  children,
  enabled = true,
}: {
  children: ReactNode
  enabled?: boolean
}) => {
  const t = useTranslate()
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const check = () =>
      setOverflowing(enabled && element.scrollHeight > COLLAPSE_HEIGHT)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(element)
    return () => observer.disconnect()
  }, [enabled])

  return (
    <div className={styles.wrapper}>
      <div
        ref={ref}
        className={clsx(styles.content, overflowing && !expanded && styles.clamped)}
      >
        {children}
      </div>
      {overflowing ? (
        <button
          type="button"
          className={styles.toggle}
          onClick={() => setExpanded((value) => !value)}
        >
          {t(expanded ? 'collapseContent' : 'expandContent')}
        </button>
      ) : null}
    </div>
  )
}
