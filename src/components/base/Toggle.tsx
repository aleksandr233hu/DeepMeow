import clsx from 'clsx'
import styles from './Toggle.module.css'

/** 小型开关：role=switch，供设置页复用 */
export const Toggle = ({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  disabled?: boolean
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    className={clsx(styles.toggle, checked && styles.on)}
    onClick={() => onChange(!checked)}
  >
    <span className={styles.knob} />
  </button>
)
