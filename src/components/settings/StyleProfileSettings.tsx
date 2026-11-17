import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import {
  STYLE_BASES,
  STYLE_DIMENSIONS,
  STYLE_LEVELS,
  type StyleBase,
  type StyleDimension,
  type StyleLevel,
  type StyleProfile,
} from '../../services/style/types.js'
import { Select, type SelectOption } from '../base/Select.js'
import styles from './StyleProfileSettings.module.css'

const BASE_LABELS: Record<StyleBase, TranslationKey> = {
  default: 'styleBaseDefault',
  professional: 'styleBaseProfessional',
  friendly: 'styleBaseFriendly',
  blunt: 'styleBaseBlunt',
  imaginative: 'styleBaseImaginative',
  efficient: 'styleBaseEfficient',
  sarcastic: 'styleBaseSarcastic',
}

const BASE_DESCRIPTIONS: Record<StyleBase, TranslationKey> = {
  default: 'styleBaseDefaultDesc',
  professional: 'styleBaseProfessionalDesc',
  friendly: 'styleBaseFriendlyDesc',
  blunt: 'styleBaseBluntDesc',
  imaginative: 'styleBaseImaginativeDesc',
  efficient: 'styleBaseEfficientDesc',
  sarcastic: 'styleBaseSarcasticDesc',
}

const DIMENSION_LABELS: Record<StyleDimension, TranslationKey> = {
  friendliness: 'styleFriendliness',
  upbeat: 'styleUpbeat',
  emoji: 'styleEmoji',
  visual: 'styleVisual',
  headings: 'styleHeadings',
}

const DIMENSION_DESCRIPTIONS: Record<StyleDimension, TranslationKey> = {
  friendliness: 'styleFriendlinessDescription',
  upbeat: 'styleUpbeatDescription',
  emoji: 'styleEmojiDescription',
  visual: 'styleVisualDescription',
  headings: 'styleHeadingsDescription',
}

const LEVEL_LABELS: Record<StyleLevel, TranslationKey> = {
  default: 'styleLevelDefault',
  more: 'styleLevelMore',
  less: 'styleLevelLess',
}

const LEVEL_DESCRIPTIONS: Record<
  StyleDimension,
  Record<Exclude<StyleLevel, 'default'>, TranslationKey>
> = {
  friendliness: {
    more: 'styleFriendlinessMoreDesc',
    less: 'styleFriendlinessLessDesc',
  },
  upbeat: {
    more: 'styleUpbeatMoreDesc',
    less: 'styleUpbeatLessDesc',
  },
  emoji: {
    more: 'styleEmojiMoreDesc',
    less: 'styleEmojiLessDesc',
  },
  visual: {
    more: 'styleVisualMoreDesc',
    less: 'styleVisualLessDesc',
  },
  headings: {
    more: 'styleHeadingsMoreDesc',
    less: 'styleHeadingsLessDesc',
  },
}

/** ChatGPT 式回答风格：基础语气 + 五个增强/默认/减弱维度 */
export const StyleProfileSettings = ({
  value,
  onChange,
  disabled = false,
}: {
  value: StyleProfile
  onChange: (value: StyleProfile) => void
  disabled?: boolean
}) => {
  const t = useTranslate()
  const baseOptions: SelectOption<StyleBase>[] = STYLE_BASES.map((base) => ({
    value: base,
    label: t(BASE_LABELS[base]),
    description: t(BASE_DESCRIPTIONS[base]),
  }))
  const levelOptions = (dimension: StyleDimension): SelectOption<StyleLevel>[] =>
    STYLE_LEVELS.map((level) => ({
      value: level,
      label: t(LEVEL_LABELS[level]),
      description:
        level === 'default'
          ? t('styleLevelDefaultDesc')
          : t(LEVEL_DESCRIPTIONS[dimension][level]),
    }))

  return (
    <div className={styles.list}>
      <div className={styles.row}>
        <div className={styles.text}>
          <div className={styles.label}>{t('styleBase')}</div>
          <div className={styles.description}>{t('styleBaseDescription')}</div>
        </div>
        <Select
          ariaLabel={t('styleBase')}
          value={value.base}
          options={baseOptions}
          disabled={disabled}
          onChange={(base) => onChange({ ...value, base })}
        />
      </div>
      {STYLE_DIMENSIONS.map((dimension) => (
        <div key={dimension} className={styles.row}>
          <div className={styles.text}>
            <div className={styles.label}>{t(DIMENSION_LABELS[dimension])}</div>
            <div className={styles.description}>{t(DIMENSION_DESCRIPTIONS[dimension])}</div>
          </div>
          <Select
            ariaLabel={t(DIMENSION_LABELS[dimension])}
            value={value[dimension]}
            options={levelOptions(dimension)}
            disabled={disabled}
            onChange={(level) => onChange({ ...value, [dimension]: level })}
          />
        </div>
      ))}
    </div>
  )
}
