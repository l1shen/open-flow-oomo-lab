import styles from './checkbox.module.scss'
import type { TooltipPlacement } from 'antd/es/tooltip'

import { Tooltip } from 'antd'
import { clsx } from 'clsx'
import React, { forwardRef, useCallback, useState } from 'react'
import { defaultTooltipProps } from './label.tsx'

export interface ILabelConfig {
  readonly true?: React.ReactNode
  readonly false?: React.ReactNode
}

export interface CheckBoxProps {
  className?: string
  style?: React.CSSProperties
  variant?: 'default' | 'compact'

  disabled?: boolean
  defaultChecked?: boolean
  checked?: boolean
  onChange?: (checked: boolean) => void

  label?: React.ReactNode | ILabelConfig
  title?: string
  titlePlacement?: TooltipPlacement
  isSuffix?: boolean
  onContextMenu?: React.MouseEventHandler
}

function isConfig(label: CheckBoxProps['label']): label is ILabelConfig {
  return Boolean(label && typeof label === 'object' && ('true' in label || 'false' in label))
}

function renderLabel(label: CheckBoxProps['label'], checked?: boolean) {
  if (isConfig(label)) {
    return checked ? label.true : label.false
  }
  return label
}

export const CheckBox: React.ForwardRefExoticComponent<CheckBoxProps & React.RefAttributes<HTMLInputElement>> = /*#__PURE__*/ forwardRef(function CheckBox(
  props: CheckBoxProps,
  ref?: React.Ref<HTMLInputElement>,
) {
  const isControlled = props.checked !== undefined
  const [internalChecked, setInternalChecked] = useState(props.defaultChecked ?? false)

  const checked = isControlled ? props.checked : internalChecked
  const onChange = useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      const nextChecked = ev.target.checked
      if (!isControlled) setInternalChecked(nextChecked)
      props.onChange?.(nextChecked)
    },
    [isControlled, props.onChange],
  )

  const checkbox = (
    <label
      className={clsx(styles.wrapper, props.variant === 'compact' && styles.compact, props.isSuffix && styles.isSuffix, props.className)}
      style={props.style}
      onContextMenu={props.onContextMenu}
    >
      <input ref={ref} type="checkbox" disabled={props.disabled} checked={checked} onChange={onChange} />
      {props.label && <span className={styles.label}>{renderLabel(props.label, checked)}</span>}
    </label>
  )

  if (props.title) {
    return (
      <Tooltip {...defaultTooltipProps} placement={props.titlePlacement || 'top'} title={props.title}>
        {checkbox}
      </Tooltip>
    )
  } else {
    return checkbox
  }
})
