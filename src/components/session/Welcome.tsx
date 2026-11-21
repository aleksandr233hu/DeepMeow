import { useEffect, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { useTranslate } from '../../i18n/index.js'
import { ChatInput } from '../chatInput/ChatInput.js'
import { CatMascot } from './CatMascot.js'
import { MobileHeader } from './MobileHeader.js'
import styles from './Welcome.module.css'

/** 首个公开版本发布日：每年这天开屏猫戴派对帽 */
const PARTY_DATE = '11-21'

const isPartyDay = (time: number) => {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}-${day}` === PARTY_DATE
}

/** 新对话：猫咪吉祥物 + 问候语 + 输入框。桌面端居中；移动端输入框吸底 */
export const Welcome = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const [now, setNow] = useState(Date.now)

  // 跨过 06:00 / 22:00 时切换问候语；回到前台也立即重算
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const hour = new Date(now).getHours()
  const daytime = hour >= 6 && hour < 22
  return (
    <div className={styles.container}>
      {isMobile ? <MobileHeader /> : null}
      <div className={styles.welcome}>
        <div className={styles.mascot}>
          <CatMascot />
          {isPartyDay(now) ? (
            <span className={styles.partyHat} aria-hidden>
              <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
                <path d="M17 3 25 27H9L17 3Z" fill="#E9AE45" />
                <path d="M17 3 25 27H17V3Z" fill="#D99A32" />
                <path d="M8.5 26.5h17" stroke="#8A9AAE" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="17" cy="3" r="2.4" fill="#D98A8A" />
                <circle cx="13.6" cy="17" r="1.4" fill="#FAF7F2" />
                <circle cx="19.8" cy="21" r="1.4" fill="#FAF7F2" />
              </svg>
            </span>
          ) : null}
        </div>
        <div className={styles.greeting}>{t(daytime ? 'welcomeDay' : 'welcomeNight')}</div>
        <ChatInput sessionId={null} />
        {isMobile ? <div className={styles.caveat}>{t('contentCaveat')}</div> : null}
      </div>
    </div>
  )
}
