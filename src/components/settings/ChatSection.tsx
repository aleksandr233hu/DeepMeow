import { useTranslate } from '../../i18n/index.js'
import {
  setMessageLayout,
  setShowAvatars,
  setShowSystemPrompt,
  setTemperature,
  setTopP,
  useSettings,
} from '../../services/settings.js'
import { Select } from '../base/Select.js'
import { Toggle } from '../base/Toggle.js'
import { AvatarSettings } from './AvatarSettings.js'
import { ParameterSlider } from './ParameterSlider.js'
import { SettingCell } from './SettingCell.js'
import styles from './ChatSection.module.css'

const TEMPERATURE_DEFAULT = 1
const TOP_P_DEFAULT = 1

/** 全局「聊天」设置：温度 / top_p、消息显示方式 */
export const ChatSection = () => {
  const t = useTranslate()
  const temperature = useSettings((state) => state.temperature)
  const topP = useSettings((state) => state.topP)
  const messageLayout = useSettings((state) => state.messageLayout)
  const showAvatars = useSettings((state) => state.showAvatars)
  const showSystemPrompt = useSettings((state) => state.showSystemPrompt)

  return (
    <>
      <div className={styles.block}>
        <div className={styles.paramHeader}>
          <div>
            <div className={styles.label}>{t('temperature')}</div>
            <div className={styles.description}>{t('temperatureDescription')}</div>
          </div>
          <div className={styles.defaultSwitch}>
            <span>{t('useModelDefault')}</span>
            <Toggle
              checked={temperature === null}
              label={t('useModelDefault')}
              onChange={(checked) => setTemperature(checked ? null : TEMPERATURE_DEFAULT)}
            />
          </div>
        </div>
        <ParameterSlider
          label={t('temperature')}
          value={temperature ?? TEMPERATURE_DEFAULT}
          min={0}
          max={2}
          step={0.05}
          disabled={temperature === null}
          onChange={setTemperature}
        />
        <div className={styles.hint}>{t('temperatureHint')}</div>
      </div>

      <div className={styles.block}>
        <div className={styles.paramHeader}>
          <div>
            <div className={styles.label}>{t('topP')}</div>
            <div className={styles.description}>{t('topPDescription')}</div>
          </div>
          <div className={styles.defaultSwitch}>
            <span>{t('useModelDefault')}</span>
            <Toggle
              checked={topP === null}
              label={t('useModelDefault')}
              onChange={(checked) => setTopP(checked ? null : TOP_P_DEFAULT)}
            />
          </div>
        </div>
        <ParameterSlider
          label={t('topP')}
          value={topP ?? TOP_P_DEFAULT}
          min={0.01}
          max={1}
          step={0.01}
          disabled={topP === null}
          onChange={setTopP}
        />
        <div className={styles.hint}>{t('topPHint')}</div>
      </div>

      <div className={styles.divider} />

      <div className={styles.sectionTitle}>{t('messageDisplay')}</div>
      <SettingCell
        label={t('messageLayoutSetting')}
        description={t('messageLayoutDescription')}
        status={null}
        action={
          <Select
            ariaLabel={t('messageLayoutSetting')}
            value={messageLayout}
            options={[
              { value: 'classic', label: t('layoutClassic') },
              { value: 'bubble', label: t('layoutBubble') },
            ]}
            onChange={setMessageLayout}
          />
        }
      />
      <AvatarSettings />
      {/* 头像总开关放在自定义头像旁边：选「不显示」时两侧头像一起隐藏 */}
      <SettingCell
        label={t('showAvatars')}
        description={t('showAvatarsDescription')}
        status={null}
        action={
          <Toggle checked={showAvatars} label={t('showAvatars')} onChange={setShowAvatars} />
        }
      />
      <SettingCell
        label={t('showSystemPrompt')}
        description={t('showSystemPromptDescription')}
        status={null}
        action={
          <Toggle
            checked={showSystemPrompt}
            label={t('showSystemPrompt')}
            onChange={setShowSystemPrompt}
          />
        }
      />
      <div className={styles.hint}>{t('chatSettingsHint')}</div>
    </>
  )
}
