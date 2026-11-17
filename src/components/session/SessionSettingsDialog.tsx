import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  applyGenerationToAll,
  setSessionGeneration,
  useChatStore,
} from '../../services/chat/store.js'
import type { IdentitySource } from '../../services/chat/identity.js'
import { useSettings } from '../../services/settings.js'
import type { StyleProfile } from '../../services/style/types.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { Select } from '../base/Select.js'
import { Toggle } from '../base/Toggle.js'
import { showToast } from '../base/toastState.js'
import { ParameterSlider } from '../settings/ParameterSlider.js'
import { StyleProfileSettings } from '../settings/StyleProfileSettings.js'
import { closeSessionSettings, useSessionSettingsDialog } from './sessionSettingsState.js'
import styles from './SessionSettingsDialog.module.css'

const TEMPERATURE_DEFAULT = 1
const TOP_P_DEFAULT = 1

type Form = {
  useTemperature: boolean
  temperature: number
  useTopP: boolean
  topP: number
  useSystemPrompt: boolean
  systemPrompt: string
  useStyleProfile: boolean
  styleProfile: StyleProfile
  identitySource: 'global' | IdentitySource
}

/** 会话级生成参数弹窗：跟随全局或覆盖；可把当前参数批量应用到所有会话 */
export const SessionSettingsDialog = () => {
  const sessionId = useSessionSettingsDialog((state) => state.sessionId)
  return sessionId ? <SessionSettingsContent key={sessionId} sessionId={sessionId} /> : null
}

const SessionSettingsContent = ({ sessionId }: { sessionId: string }) => {
  const t = useTranslate()
  const session = useChatStore((state) =>
    Object.hasOwn(state.sessionCache, sessionId) ? state.sessionCache[sessionId] : undefined
  )
  const defaults = {
    temperature: useSettings((state) => state.temperature),
    topP: useSettings((state) => state.topP),
    defaultSystemPrompt: useSettings((state) => state.agentInstructions),
    styleProfile: useSettings((state) => state.styleProfile),
    identitySource: useSettings((state) => state.identitySource),
  }
  const [form, setForm] = useState<Form>(() => ({
    useTemperature: session?.generation?.temperature !== undefined,
    temperature: session?.generation?.temperature ?? defaults.temperature ?? TEMPERATURE_DEFAULT,
    useTopP: session?.generation?.topP !== undefined,
    topP: session?.generation?.topP ?? defaults.topP ?? TOP_P_DEFAULT,
    useSystemPrompt: session?.generation?.systemPrompt !== undefined,
    systemPrompt: session?.generation?.systemPrompt ?? defaults.defaultSystemPrompt,
    useStyleProfile: session?.styleProfile !== undefined,
    styleProfile: session?.styleProfile ?? defaults.styleProfile,
    identitySource: session?.identitySource ?? 'global',
  }))
  const [confirmBatch, setConfirmBatch] = useState(false)
  const [batching, setBatching] = useState(false)

  if (!session) {
    return null
  }

  const globalTemperature = defaults.temperature ?? TEMPERATURE_DEFAULT
  const globalTopP = defaults.topP ?? TOP_P_DEFAULT
  const effectiveIdentitySource =
    form.identitySource === 'global' ? defaults.identitySource : form.identitySource

  const save = () => {
    const ok = setSessionGeneration(
      sessionId,
      {
        ...(form.useTemperature ? { temperature: form.temperature } : {}),
        ...(form.useTopP ? { topP: form.topP } : {}),
        ...(form.useSystemPrompt ? { systemPrompt: form.systemPrompt } : {}),
      },
      form.useStyleProfile ? form.styleProfile : null,
      form.identitySource === 'global' ? null : form.identitySource
    )
    if (ok) {
      showToast({ key: 'sessionSettingsSaved' })
      closeSessionSettings()
    } else {
      showToast({ key: 'sessionSettingsSaveFailed', type: 'error' })
    }
  }

  const batchApply = async () => {
    if (batching) {
      return
    }
    setBatching(true)
    const result = await applyGenerationToAll(sessionId)
    setBatching(false)
    if (result === 'done') {
      setConfirmBatch(false)
      closeSessionSettings()
      showToast({ key: 'appliedToAllSessions' })
    } else if (result === 'busy') {
      showToast({ key: 'applyToAllBusy', type: 'error' })
    } else {
      showToast({ key: 'applyToAllFailed', type: 'error' })
    }
  }

  return (
    <>
      <Modal
        title={t('sessionSettingsTitle')}
        closable
        className={styles.dialog}
        onClose={closeSessionSettings}
        footer={
          <div className={styles.footer}>
            <Button
              variant="outlined"
              size="m"
              disabled={batching}
              onClick={() => setConfirmBatch(true)}
            >
              {t('applyToAllSessions')}
            </Button>
            <div className={styles.footerActions}>
              <Button variant="outlined" size="m" onClick={closeSessionSettings}>
                {t('cancel')}
              </Button>
              <Button size="m" onClick={save}>
                {t('save')}
              </Button>
            </div>
          </div>
        }
      >
        <div className={styles.hintTop}>{t('sessionSettingsDescription')}</div>

        <div className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <div className={styles.label}>{t('identitySource')}</div>
              <div className={styles.description}>{t('identitySourceSessionDescription')}</div>
            </div>
            <Select
              ariaLabel={t('identitySource')}
              value={form.identitySource}
              options={[
                { value: 'global', label: t('identityFollowGlobal') },
                { value: 'persona', label: t('identityPersona') },
                { value: 'agent', label: t('identityAgent') },
              ]}
              onChange={(identitySource) => setForm((current) => ({ ...current, identitySource }))}
            />
          </div>
        </div>

        <div className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <div className={styles.label}>{t('systemPromptSession')}</div>
              <div className={styles.description}>
                {effectiveIdentitySource === 'persona'
                  ? t('agentIgnoredByPersonaHint')
                  : form.useSystemPrompt
                    ? t('sessionOverrideHint')
                    : t('followGlobalWithValue', {
                        value: defaults.defaultSystemPrompt || t('notSet'),
                      })}
              </div>
            </div>
            <div className={styles.switch}>
              <span>{t('customOverride')}</span>
              <Toggle
                checked={form.useSystemPrompt}
                label={t('customOverride')}
                disabled={effectiveIdentitySource === 'persona'}
                onChange={(useSystemPrompt) =>
                  setForm((current) => ({
                    ...current,
                    useSystemPrompt,
                    systemPrompt:
                      useSystemPrompt && !current.systemPrompt
                        ? defaults.defaultSystemPrompt
                        : current.systemPrompt,
                  }))
                }
              />
            </div>
          </div>
          <textarea
            className={styles.textarea}
            rows={4}
            value={form.useSystemPrompt ? form.systemPrompt : defaults.defaultSystemPrompt}
            disabled={!form.useSystemPrompt || effectiveIdentitySource === 'persona'}
            placeholder={t('agentInstructionsPlaceholder')}
            aria-label={t('systemPromptSession')}
            onChange={(event) =>
              setForm((current) => ({ ...current, systemPrompt: event.target.value }))
            }
          />
        </div>

        <div className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <div className={styles.label}>{t('temperature')}</div>
              <div className={styles.description}>
                {form.useTemperature
                  ? t('sessionOverrideHint')
                  : t('followGlobalWithValue', { value: globalTemperature.toFixed(2) })}
              </div>
            </div>
            <div className={styles.switch}>
              <span>{t('customOverride')}</span>
              <Toggle
                checked={form.useTemperature}
                label={t('customOverride')}
                onChange={(useTemperature) =>
                  setForm((current) => ({
                    ...current,
                    useTemperature,
                    temperature: useTemperature ? globalTemperature : current.temperature,
                  }))
                }
              />
            </div>
          </div>
          <ParameterSlider
            label={t('temperature')}
            value={form.temperature}
            min={0}
            max={2}
            step={0.05}
            disabled={!form.useTemperature}
            onChange={(temperature) => setForm((current) => ({ ...current, temperature }))}
          />
          <div className={styles.hint}>{t('temperatureHint')}</div>
        </div>

        <div className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <div className={styles.label}>{t('topP')}</div>
              <div className={styles.description}>
                {form.useTopP
                  ? t('sessionOverrideHint')
                  : t('followGlobalWithValue', { value: globalTopP.toFixed(2) })}
              </div>
            </div>
            <div className={styles.switch}>
              <span>{t('customOverride')}</span>
              <Toggle
                checked={form.useTopP}
                label={t('customOverride')}
                onChange={(useTopP) =>
                  setForm((current) => ({
                    ...current,
                    useTopP,
                    topP: useTopP ? globalTopP : current.topP,
                  }))
                }
              />
            </div>
          </div>
          <ParameterSlider
            label={t('topP')}
            value={form.topP}
            min={0.01}
            max={1}
            step={0.01}
            disabled={!form.useTopP}
            onChange={(topP) => setForm((current) => ({ ...current, topP }))}
          />
          <div className={styles.hint}>{t('topPHint')}</div>
        </div>

        <div className={styles.block}>
          <div className={styles.blockHead}>
            <div>
              <div className={styles.label}>{t('stylePreset')}</div>
              <div className={styles.description}>
                {form.useStyleProfile ? t('sessionOverrideHint') : t('followGlobal')}
              </div>
            </div>
            <div className={styles.switch}>
              <span>{t('customOverride')}</span>
              <Toggle
                checked={form.useStyleProfile}
                label={t('customOverride')}
                onChange={(useStyleProfile) =>
                  setForm((current) => ({ ...current, useStyleProfile }))
                }
              />
            </div>
          </div>
          {form.useStyleProfile ? (
            <StyleProfileSettings
              value={form.styleProfile}
              onChange={(styleProfile) => setForm((current) => ({ ...current, styleProfile }))}
            />
          ) : null}
        </div>
      </Modal>

      {confirmBatch ? (
        <Modal
          title={t('applyToAllConfirmTitle')}
          onClose={() => {
            if (!batching) {
              setConfirmBatch(false)
            }
          }}
          footer={
            <div className={styles.footerActions}>
              <Button
                variant="outlined"
                size="m"
                autoFocus
                disabled={batching}
                onClick={() => setConfirmBatch(false)}
              >
                {t('cancel')}
              </Button>
              <Button size="m" disabled={batching} onClick={() => void batchApply()}>
                {t(batching ? 'applyingToAll' : 'confirm')}
              </Button>
            </div>
          }
        >
          <div className={styles.confirmText}>{t('applyToAllConfirmDescription')}</div>
        </Modal>
      ) : null}
    </>
  )
}
