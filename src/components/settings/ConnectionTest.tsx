import clsx from 'clsx'
import { useState } from 'react'
import { testModelConnection } from '../../services/api/client.js'
import { useSettings } from '../../services/settings.js'
import type { ChatModel } from '../../services/api/types.js'
import { Button } from '../base/Button.js'
import { useTranslate } from '../../i18n/index.js'
import styles from './Settings.module.css'

const MODELS: ChatModel[] = ['deepseek-flash', 'deepseek-v4-pro']

type TestState =
  | { status: 'pending' }
  | { status: 'ok'; latency: number }
  | { status: 'failed'; message: string }

/** 测试连接：分别向 flash 与 Pro 各发一条最小请求，确认两个模型都能真实调用。 */
export const ConnectionTest = () => {
  const t = useTranslate()
  const apiKey = useSettings((state) => state.apiKey)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Partial<Record<ChatModel, TestState>>>({})

  const run = async () => {
    if (!apiKey || running) {
      return
    }
    setRunning(true)
    setResults({ 'deepseek-flash': { status: 'pending' }, 'deepseek-v4-pro': { status: 'pending' } })
    await Promise.all(
      MODELS.map(async (model) => {
        try {
          const latency = await testModelConnection(apiKey, model)
          setResults((prev) => ({ ...prev, [model]: { status: 'ok', latency } }))
        } catch (error) {
          setResults((prev) => ({
            ...prev,
            [model]: {
              status: 'failed',
              message: error instanceof Error ? error.message : String(error),
            },
          }))
        }
      })
    )
    setRunning(false)
  }

  return (
    <div className={styles.cell}>
      <div className={styles.row}>
        <div className={styles.text}>
          <div className={styles.label}>{t('connectionTest')}</div>
          <div className={styles.description}>
            {apiKey ? t('connectionTestDescription') : t('connectionTestNeedKey')}
          </div>
        </div>
        <Button
          variant="outlined"
          size="m"
          className={styles.cellButton}
          disabled={!apiKey || running}
          onClick={() => void run()}
        >
          {running ? t('connectionTestRunning') : t('connectionTestRun')}
        </Button>
      </div>
      {MODELS.some((model) => results[model]) ? (
        <div className={styles.connectionResults}>
          {MODELS.map((model) => {
            const result = results[model]
            if (!result) {
              return null
            }
            return (
              <div key={model} className={styles.connectionRow}>
                <span className={styles.connectionModel}>{model}</span>
                <span
                  className={clsx(
                    styles.connectionStatus,
                    result.status === 'ok' && styles.connectionOk,
                    result.status === 'failed' && styles.connectionFailed
                  )}
                >
                  {result.status === 'pending'
                    ? t('connectionTestPending')
                    : result.status === 'ok'
                      ? `${t('connectionTestOk')} · ${result.latency} ms`
                      : `${t('connectionTestFailed')} · ${result.message}`}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
