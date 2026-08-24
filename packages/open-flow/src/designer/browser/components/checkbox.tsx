import styles from './checkbox.module.scss'
import type { TooltipPlacement } from './tooltip.tsx'

import { clsx } from 'clsx'
import React, { forwardRef, useCallback, useState } from 'react'
import { Checkbox } from '../../../ui/browser/checkbox.tsx'
import { DesignerTooltip } from './tooltip.tsx'

export interface BooleanLabel {
  readonly true?: React.ReactNode
  readonly false?: React.ReactNode
}

export interface DesignerCheckboxProps {
  ariaLabel?: string
  className?: string
  style?: React.CSSProperties
  variant?: 'default' | 'compact'

  disabled?: boolean
  defaultChecked?: boolean
  checked?: boolean
  onChange?: (checked: boolean) => void

  label?: React.ReactNode | BooleanLabel
  title?: string
  titlePlacement?: TooltipPlacement
  isSuffix?: boolean
  onContextMenu?: React.MouseEventHandler
}

function isConfig(label: DesignerCheckboxProps['label']): label is BooleanLabel {
  return Boolean(label && typeof label === 'object' && ('true' in label || 'false' in label))
}

function renderLabel(label: DesignerCheckboxProps['label'], checked?: boolean) {
  if (isConfig(label)) {
    return checked ? label.true : label.false
  }
  return label
}

export const DesignerCheckbox: React.ForwardRefExoticComponent<DesignerCheckboxProps & React.RefAttributes<HTMLInputElement>> = /*#__PURE__*/ forwardRef(
  function DesignerCheckbox(props: DesignerCheckboxProps, ref?: React.Ref<HTMLInputElement>) {
    const isControlled = props.checked !== undefined
    const [internalChecked, setInternalChecked] = useState(props.defaultChecked ?? false)

    const checked = isControlled ? props.checked : internalChecked
    const onChange = useCallback(
      (nextChecked: boolean) => {
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
        <Checkbox aria-label={props.ariaLabel} checked={checked} disabled={props.disabled} inputRef={ref} onCheckedChange={onChange} />
        {props.label && <span className={styles.label}>{renderLabel(props.label, checked)}</span>}
      </label>
    )

    if (props.title) {
      return (
        <DesignerTooltip placement={props.titlePlacement || 'top'} title={props.title}>
          {checkbox}
        </DesignerTooltip>
      )
    } else {
      return checkbox
    }
  },
)
