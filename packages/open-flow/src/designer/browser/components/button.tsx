import styles from './button.module.scss'
import type { TooltipPlacement } from 'antd/es/tooltip'

import { Tooltip } from 'antd'
import { clsx } from 'clsx'
import { forwardRef } from 'react'
import { isPositiveNumber } from '../base/trivial.ts'
import { defaultTooltipProps } from './label.tsx'

export interface ButtonProps {
  id?: string
  ariaLabel?: string
  ariaPressed?: boolean
  className?: string
  wrapperClassName?: string
  style?: React.CSSProperties
  variant?: 'default' | 'outline' | 'danger'
  // Render the button as a dropdown with a chevron in the top-right corner.
  dropDown?: boolean
  // Add a small badge in the top-right corner.
  count?: number
  // Render the button as a checkbox.
  active?: boolean
  // Render an icon before the button text.
  prefix?: React.ReactNode
  // Render an icon at the right side of the button.
  suffix?: React.ReactNode
  // Grow the height to fit the content.
  autoHeight?: boolean
  title?: string
  htmlTitle?: string
  htmlType?: React.ButtonHTMLAttributes<HTMLButtonElement>['type']
  titlePlacement?: TooltipPlacement
  disabled?: boolean
  onClick?: (ev: React.MouseEvent<HTMLButtonElement>) => void
  onClear?: (ev: React.MouseEvent<HTMLButtonElement>) => void
  clearIcon?: string
  children?: React.ReactNode
  isSuffix?: boolean
  getPopupContainer?: () => HTMLElement
}

export const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>> = /*#__PURE__*/ forwardRef(function Button(
  props: ButtonProps,
  ref?: React.Ref<HTMLButtonElement>,
) {
  return (
    <Tooltip
      {...defaultTooltipProps}
      placement={props.titlePlacement ?? defaultTooltipProps.placement}
      title={props.autoHeight ? void 0 : props.title}
      getPopupContainer={props.getPopupContainer}
    >
      <div className={clsx(styles.wrapper, props.isSuffix && styles.isSuffix, props.wrapperClassName)}>
        <button
          id={props.id}
          ref={ref}
          aria-label={props.ariaLabel}
          aria-pressed={props.ariaPressed}
          className={clsx(
            'nodrag',
            styles.button,
            props.variant === 'danger' && styles.danger,
            props.variant === 'outline' && styles.outline,
            props.dropDown && styles.dropDown,
            props.count && styles.count,
            props.autoHeight && styles.autoHeight,
            props.active && styles.active,
            props.className,
          )}
          title={props.htmlTitle}
          type={props.htmlType}
          style={props.style}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.prefix && <span className={styles.prefix}>{props.prefix}</span>}
          {props.children}
          {props.suffix && <span className={styles.suffix}>{props.suffix}</span>}
          {props.dropDown && <i className="i-codicon:chevron-down" />}
          {isPositiveNumber(props.count) && <span className={styles.badge}>{renderCount(props.count)}</span>}
        </button>
        {props.onClear && (
          <button tabIndex={-1} className={styles.clear} onClick={props.onClear}>
            <i className={props.clearIcon ?? 'i-codicon:close'} />
          </button>
        )}
      </div>
    </Tooltip>
  )
})

function renderCount(count: number) {
  if (0 <= count && count < 1000) {
    return count
  }
  return '999+'
}
