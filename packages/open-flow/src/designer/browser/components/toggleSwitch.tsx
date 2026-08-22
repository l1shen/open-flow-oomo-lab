import styles from './toggleSwitch.module.scss'
import type { JSX } from 'react/jsx-runtime'
import type { ILabelConfig } from './checkbox.tsx'

import { Tooltip } from 'antd'
import { clsx } from 'clsx'
import { useCallback, useState } from 'react'
import { defaultTooltipProps } from './label.tsx'

export interface ToggleSwitchProps {
  className?: string
  style?: React.CSSProperties

  disabled?: boolean
  defaultChecked?: boolean
  checked?: boolean
  onClear?: () => void
  onChange?: (checked: boolean) => void

  // Show at the left side of the row, the switcher is at the right side.
  label?: React.ReactNode | ILabelConfig
  title?: string
  isSuffix?: boolean
}

function isConfig(label: ToggleSwitchProps['label']): label is ILabelConfig {
  return Boolean(label && typeof label === 'object' && ('true' in label || 'false' in label))
}

function renderLabel(label: ToggleSwitchProps['label'], checked?: boolean) {
  if (isConfig(label)) {
    return checked ? label.true : label.false
  }
  return label
}

export function ToggleSwitch(props: ToggleSwitchProps): JSX.Element {
  const isControlled = props.checked !== undefined
  const [internalChecked, setInternalChecked] = useState(props.defaultChecked ?? false)

  const checked = isControlled ? props.checked : internalChecked
  const onClick = useCallback(() => {
    const nextChecked = !checked
    if (!isControlled) setInternalChecked(nextChecked)
    props.onChange?.(nextChecked)
  }, [isControlled, checked, props.onChange])

  return (
    <Tooltip {...defaultTooltipProps} placement="top" title={props.title}>
      <div className={clsx(props.className, styles.wrapper, checked && styles.checked, props.isSuffix && styles.isSuffix)} style={props.style}>
        <button className={styles.content} disabled={props.disabled} onClick={onClick}>
          <label className={styles.label} title={props.title}>
            {renderLabel(props.label, checked)}
          </label>
          <div className={styles.button}>
            <div className={styles.fg}></div>
          </div>
        </button>
        {props.onClear && (
          <div className={styles.clearWrapper}>
            <button tabIndex={-1} className={styles.clear} onClick={props.onClear}>
              <i className="i-codicon:close" />
            </button>
            <div className={styles.clearIndicator} />
          </div>
        )}
      </div>
    </Tooltip>
  )
}
