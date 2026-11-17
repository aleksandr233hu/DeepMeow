import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Android 打包配置。
 * appId 与签名固定后才能覆盖升级保留本地数据；首次安装前如需修改，请同步更新 Android 工程。
 */
const config: CapacitorConfig = {
  appId: 'com.deepseek.local',
  appName: 'DeepMeow',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
