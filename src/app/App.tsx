import { useEffect } from 'react'
import { useTranslate } from '../i18n/index.js'
import { initAvatars } from '../services/avatar/store.js'
import { initSessionGroups } from '../services/chat/groups.js'
import { initMemories } from '../services/memory/store.js'
import { initPresets } from '../services/presets/store.js'
import { useSettings } from '../services/settings.js'
import { useIsMobile, useMobileViewport, usePreventPageScroll } from './viewport.js'
import {
  bindChatPersistence,
  initChat,
  retrySaveSessions,
  selectSession,
  useChatStore,
} from '../services/chat/store.js'
import { SearchPanel } from '../components/search/SearchPanel.js'
import { UpdateDialog } from '../components/update/UpdateDialog.js'
import { useUpdateStore } from '../services/update/updateState.js'
import { markAppReady } from '../services/update/liveUpdate.js'
import { closeSearchPanel } from '../components/search/searchPanelState.js'
import { SessionView } from '../components/session/SessionView.js'
import { SessionSettingsDialog } from '../components/session/SessionSettingsDialog.js'
import { MobileHeader } from '../components/session/MobileHeader.js'
import { Welcome } from '../components/session/Welcome.js'
import { ensureApiKey } from '../components/settings/settingsDialogState.js'
import { SettingsDialog } from '../components/settings/SettingsDialog.js'
import { Toast } from '../components/base/Toast.js'
import { showToast } from '../components/base/toastState.js'
import { ForkDialog } from '../components/messages/ForkDialog.js'
import { ImagePreview } from '../components/messages/ImagePreview.js'
import { onUploadNotice } from '../services/attachments.js'
import { Button } from '../components/base/Button.js'
import { stopReadAloud } from '../services/speech/readAloud.js'
import { CollapsedSider } from '../components/sider/CollapsedSider.js'
import { closeMobileSider } from '../components/sider/mobileSiderState.js'
import { MobileSider, Sider } from '../components/sider/Sider.js'
import styles from './App.module.css'

export const App = () => {
  const t = useTranslate()
  const isMobile = useIsMobile()
  const locale = useSettings((state) => state.locale)
  // 移动端侧边栏以独立抽屉管理开合状态
  const siderCollapsed = useSettings((state) => state.siderCollapsed) && !isMobile
  const ready = useChatStore((state) => state.ready)
  const initError = useChatStore((state) => state.initError)
  const saveError = useChatStore((state) => Object.values(state.sessionSaveErrors).some(Boolean))
  const importingHistory = useChatStore((state) => state.importingHistory)
  const session = useChatStore((state) =>
    state.activeId !== null && Object.hasOwn(state.sessionCache, state.activeId)
      ? state.sessionCache[state.activeId]
      : undefined
  )
  const sessionLoadError = useChatStore((state) =>
    state.activeId === null ? false : state.sessionLoadErrors[state.activeId] === true
  )
  const frameRef = useMobileViewport(isMobile)
  const streaming = useChatStore((state) =>
    state.activeId === null ? false : Object.hasOwn(state.streaming, state.activeId)
  )
  const activeId = useChatStore((state) => state.activeId)

  usePreventPageScroll(isMobile)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  // 文件数、存储空间达到上限时，附件上只显示「上传失败」，原因用 toast 说明
  useEffect(() => onUploadNotice(showToast), [])
  useEffect(bindChatPersistence, [])

  // 搜索结果面板只属于当前会话
  useEffect(closeSearchPanel, [activeId])
  // 切换会话时停止朗读
  useEffect(stopReadAloud, [activeId])
  // 移动端选中会话、切换布局后收起抽屉
  useEffect(closeMobileSider, [activeId, isMobile])

  useEffect(() => {
    void initChat()
    void initMemories()
    void initPresets()
    void initAvatars()
    void initSessionGroups()
    // 首次打开先在设置里输入 API Key
    ensureApiKey()
  }, [])

  useEffect(() => {
    const { init, autoCheck, initWeb, autoCheckWeb } = useUpdateStore.getState()
    void init()
    void initWeb()
    // 告诉热更新插件当前包能正常启动；刚从坏包回滚时提示一次
    void markAppReady().then((rollback) => {
      if (rollback) {
        showToast({ key: 'webUpdateRollback' })
      }
    })
    // 延后检查更新：避开启动时的数据加载与首屏渲染，失败时静默
    const timer = setTimeout(() => {
      void autoCheck()
      void autoCheckWeb()
    }, 4000)
    return () => clearTimeout(timer)
  }, [])

  // 深夜连续使用 40 分钟提醒一次（每天最多一次；切后台暂停，长时间离开会重新计时）
  useEffect(() => {
    const STORAGE_KEY = 'deepmeow:night-reminder-day'
    const THRESHOLD = 40 * 60 * 1000
    const BREAK = 10 * 60 * 1000
    const isNight = (date: Date) => date.getHours() >= 22 || date.getHours() < 6
    const dayKey = (date: Date) =>
      `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    let accumulated = 0
    let lastTick = Date.now()
    let hiddenAt: number | null = null

    const tick = () => {
      const now = Date.now()
      if (document.visibilityState === 'hidden') {
        hiddenAt = now
        lastTick = now
        return
      }
      if (hiddenAt !== null) {
        if (now - hiddenAt > BREAK) {
          accumulated = 0
        }
        hiddenAt = null
      }
      const date = new Date(now)
      if (!isNight(date)) {
        accumulated = 0
        lastTick = now
        return
      }
      accumulated += now - lastTick
      lastTick = now
      const key = dayKey(date)
      try {
        if (accumulated >= THRESHOLD && localStorage.getItem(STORAGE_KEY) !== key) {
          localStorage.setItem(STORAGE_KEY, key)
          showToast({ key: 'nightReminder' })
          accumulated = 0
        }
      } catch {
        // 存储不可用时静默
      }
    }

    const timer = setInterval(tick, 30_000)
    const onVisibility = () => tick()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <>
      <div ref={frameRef} className={styles.frame}>
        {isMobile ? <MobileSider /> : siderCollapsed ? null : <Sider />}
        <main className={styles.main}>
          {saveError ? (
            <div className={styles.saveError} role="alert">
              <span>{t('sessionSaveFailed')}</span>
              <Button
                variant="outlined"
                size="s"
                disabled={importingHistory}
                onClick={retrySaveSessions}
              >
                {t('retry')}
              </Button>
            </div>
          ) : null}
          <div className={styles.content}>
            {siderCollapsed ? <CollapsedSider /> : null}
            {!ready || (activeId !== null && !session) ? (
              <div className={styles.loadingView}>
                {isMobile ? <MobileHeader /> : null}
                <div className={styles.loadingState} role="status" aria-live="polite">
                  <span>
                    {(!ready ? initError : sessionLoadError)
                      ? t(!ready ? 'sessionListLoadFailed' : 'sessionLoadFailed')
                      : t('sessionLoading')}
                  </span>
                  {(!ready ? initError : sessionLoadError) ? (
                    <Button
                      variant="outlined"
                      size="m"
                      onClick={() => {
                        if (!ready) {
                          void initChat()
                        } else if (activeId !== null) {
                          selectSession(activeId)
                        }
                      }}
                    >
                      {t('retry')}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : session ? (
              <SessionView
                session={session}
                streaming={streaming}
                siderCollapsed={siderCollapsed}
              />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
        <SearchPanel />
      </div>
      <SettingsDialog />
      <SessionSettingsDialog />
      <ForkDialog />
      <UpdateDialog />
      <ImagePreview />
      <Toast />
    </>
  )
}
