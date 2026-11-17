import styles from './ParameterSlider.module.css'

/** 带数值显示的滑杆，供全局与会话级生成参数复用 */
export const ParameterSlider = ({
  label,
  value,
  min,
  max,
  step,
  disabled = false,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  disabled?: boolean
  onChange: (value: number) => void
}) => (
  <div className={styles.slider}>
    <div className={styles.head}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value.toFixed(2)}</span>
    </div>
    <input
      type="range"
      className={styles.range}
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
    />
    <div className={styles.scale}>
      <span>{min}</span>
      <span>{max}</span>
    </div>
  </div>
)
