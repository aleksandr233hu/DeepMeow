import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { useMemoryStore } from '../../services/memory/store.js'
import { usePresetStore } from '../../services/presets/store.js'
import { resolveGeneration } from '../../services/chat/generation.js'
import { resolveIdentitySource } from '../../services/chat/identity.js'
import { buildSystemPrompt } from '../../services/chat/systemPrompt.js'
import type { Session } from '../../services/chat/types.js'
import { resolveStyleProfile } from '../../services/style/resolve.js'
import { useSettings } from '../../services/settings.js'
import { IconChevronDownOutline14, IconChevronRightOutline14 } from '../base/icons.js'
import styles from './SystemPromptCard.module.css'

/** 会话顶部展示当前实际发送的系统提示词；默认折叠，受「显示系统提示词」开关控制 */
export const SystemPromptCard = ({ session }: { session: Session }) => {
  const t = useTranslate()
  const [expanded, setExpanded] = useState(false)
  const show = useSettings((state) => state.showSystemPrompt)
  const nickname = useSettings((state) => state.nickname)
  const occupation = useSettings((state) => state.occupation)
  const aboutMe = useSettings((state) => state.aboutMe)
  const responseStyle = useSettings((state) => state.responseStyle)
  const styleProfile = useSettings((state) => state.styleProfile)
  const identitySource = useSettings((state) => state.identitySource)
  const memoryEnabled = useSettings((state) => state.memoryEnabled)
  const defaultSystemPrompt = useSettings((state) => state.agentInstructions)
  const temperature = useSettings((state) => state.temperature)
  const topP = useSettings((state) => state.topP)
  const defaultPresetId = useSettings((state) => state.defaultPresetId)
  const memories = useMemoryStore((state) => state.memories)
  const presets = usePresetStore((state) => state.presets)

  if (!show) {
    return null
  }

  const source = resolveIdentitySource(session, identitySource)
  const preset =
    source === 'persona'
      ? ((session.presetId ? presets.find((item) => item.id === session.presetId) : undefined) ??
        presets.find((item) => item.id === defaultPresetId) ??
        presets.find((item) => item.id === 'builtin-general') ??
        presets[0])
      : undefined
  const generation = resolveGeneration(session, { temperature, topP, agentInstructions: defaultSystemPrompt })
  const prompt = buildSystemPrompt({
    compression: session.compression,
    agentInstructions: source === 'agent' ? generation.agentInstructions : '',
    preset,
    nickname,
    occupation,
    aboutMe,
    responseStyle,
    styleProfile: resolveStyleProfile(session, styleProfile),
    memories: memoryEnabled
      ? memories.filter((memory) => memory.enabled).map((memory) => memory.text)
      : [],
  })

  return (
    <div className={styles.card}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className={styles.icon}>
          {expanded ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
        </span>
        <span className={styles.title}>{t('systemPromptCardTitle')}</span>
        <span className={styles.hint}>
          {t(expanded ? 'collapseContent' : 'systemPromptCardHint')}
        </span>
      </button>
      {expanded ? <div className={styles.body}>{prompt}</div> : null}
    </div>
  )
}
