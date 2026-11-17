import { useSettings, type BubbleWidth, type FontPreference } from '../services/settings.js'

/** 用户气泡左右留白：越宽留白越小 */
const BUBBLE_INSET: Record<BubbleWidth, string> = {
  narrow: '140px',
  comfortable: '88px',
  wide: '48px',
}

/** 字体栈：默认猫主题圆体，可切换为系统字体 */
const FONT_FAMILY: Record<FontPreference, string> = {
  round:
    "'DeepMeow Round', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif",
  system:
    "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif",
}

const syncAppearance = () => {
  const { accentColor, fontPreference, fontScale, bubbleWidth } = useSettings.getState()
  const root = document.documentElement
  root.style.setProperty('--app-font-scale', String(fontScale))
  root.style.setProperty('--app-bubble-inset', BUBBLE_INSET[bubbleWidth])
  // inline 样式覆盖 global.css 里 body 上的默认字体
  document.body.style.setProperty('--dsw-font-family', FONT_FAMILY[fontPreference])
  document.body.dataset.appAccent = accentColor
}

/** 首屏应用一次外观设置，之后随设置变化更新 */
export const setupAppearance = () => {
  syncAppearance()
  useSettings.subscribe(syncAppearance)
}
