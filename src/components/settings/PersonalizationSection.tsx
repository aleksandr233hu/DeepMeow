import { useTranslate } from '../../i18n/index.js'
import {
  setAboutMe,
  setAgentInstructions,
  setIdentitySource,
  setNickname,
  setOccupation,
  setResponseStyle,
  setStyleProfile,
  useSettings,
} from '../../services/settings.js'
import { Select } from '../base/Select.js'
import { SettingCell } from './SettingCell.js'
import { StyleProfileSettings } from './StyleProfileSettings.js'
import styles from './PersonalizationSection.module.css'

/** 自定义：Agent 指令、关于你、回答方式，均随请求注入系统提示词 */
export const PersonalizationSection = () => {
  const t = useTranslate()
  const agentInstructions = useSettings((state) => state.agentInstructions)
  const identitySource = useSettings((state) => state.identitySource)
  const nickname = useSettings((state) => state.nickname)
  const occupation = useSettings((state) => state.occupation)
  const aboutMe = useSettings((state) => state.aboutMe)
  const responseStyle = useSettings((state) => state.responseStyle)
  const styleProfile = useSettings((state) => state.styleProfile)

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t('agentSectionTitle')}</div>
        <SettingCell
          label={t('identitySource')}
          description={t('identitySourceDescription')}
          status={null}
          action={
            <Select
              ariaLabel={t('identitySource')}
              value={identitySource}
              options={[
                { value: 'persona', label: t('identityPersona') },
                { value: 'agent', label: t('identityAgent') },
              ]}
              onChange={setIdentitySource}
            />
          }
        />
        <div className={styles.block}>
          <div className={styles.label}>{t('agentInstructions')}</div>
          <div className={styles.description}>{t('agentInstructionsDescription')}</div>
          <textarea
            className={styles.textarea}
            rows={5}
            value={agentInstructions}
            placeholder={t('agentInstructionsPlaceholder')}
            aria-label={t('agentInstructions')}
            onChange={(event) => setAgentInstructions(event.target.value)}
          />
          <div className={styles.hint}>
            {t(identitySource === 'persona' ? 'agentIgnoredByPersonaHint' : 'systemPromptOverrideHint')}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t('userSectionTitle')}</div>
        <SettingCell
          label={t('nickname')}
          description={t('nicknameDescription')}
          status={null}
          action={
            <input
              className={styles.input}
              value={nickname}
              placeholder={t('nicknamePlaceholder')}
              aria-label={t('nickname')}
              onChange={(event) => setNickname(event.target.value)}
            />
          }
        />
        <SettingCell
          label={t('occupation')}
          description={t('occupationDescription')}
          status={null}
          action={
            <input
              className={styles.input}
              value={occupation}
              placeholder={t('occupationPlaceholder')}
              aria-label={t('occupation')}
              onChange={(event) => setOccupation(event.target.value)}
            />
          }
        />
        <div className={styles.block}>
          <div className={styles.label}>{t('aboutMe')}</div>
          <div className={styles.description}>{t('aboutMeDescription')}</div>
          <textarea
            className={styles.textarea}
            rows={4}
            value={aboutMe}
            placeholder={t('aboutMePlaceholder')}
            aria-label={t('aboutMe')}
            onChange={(event) => setAboutMe(event.target.value)}
          />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>{t('responseSectionTitle')}</div>
        <div className={styles.block}>
          <div className={styles.label}>{t('stylePreset')}</div>
          <div className={styles.description}>{t('stylePresetDescription')}</div>
          <StyleProfileSettings value={styleProfile} onChange={setStyleProfile} />
        </div>
        <div className={styles.block}>
          <div className={styles.label}>{t('responseStyle')}</div>
          <div className={styles.description}>{t('responseStyleDescription')}</div>
          <textarea
            className={styles.textarea}
            rows={4}
            value={responseStyle}
            placeholder={t('responseStylePlaceholder')}
            aria-label={t('responseStyle')}
            onChange={(event) => setResponseStyle(event.target.value)}
          />
        </div>
      </section>

      <div className={styles.footerHint}>{t('personalizationHint')}</div>
    </>
  )
}
