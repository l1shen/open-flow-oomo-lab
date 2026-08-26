import styles from './button.module.scss'
import type { TooltipPlacement } from './tooltip.tsx'

import { clsx } from 'clsx'
import { forwardRef } from 'react'
import { Button as ShadcnButton } from '../../../ui/browser/button.tsx'
import { isPositiveNumber } from '../base/trivial.ts'
import { DesignerTooltip } from './tooltip.tsx'

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
    <DesignerTooltip getPopupContainer={props.getPopupContainer} placement={props.titlePlacement ?? 'left'} title={props.autoHeight ? undefined : props.title}>
      <div className={clsx(styles.wrapper, props.isSuffix && styles.isSuffix, props.wrapperClassName)}>
        <ShadcnButton
          id={props.id}
          ref={ref}
          aria-label={props.ariaLabel}
          aria-pressed={props.ariaPressed ?? props.active}
          className={clsx(
            props.variant === 'danger' && styles.danger,
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
          variant={props.variant == 'danger' ? 'destructive' : props.variant}
        >
          {props.prefix && <span className={styles.prefix}>{props.prefix}</span>}
          {props.children}
          {props.suffix && <span className={styles.suffix}>{props.suffix}</span>}
          {props.dropDown && <i className="i-codicon:chevron-down" />}
          {isPositiveNumber(props.count) && <span className={styles.badge}>{renderCount(props.count)}</span>}
        </ShadcnButton>
        {props.onClear && (
          <ShadcnButton className={styles.clear} onClick={props.onClear} size="icon-xs" tabIndex={-1} variant="ghost">
            <i className={props.clearIcon ?? 'i-codicon:close'} />
          </ShadcnButton>
        )}
      </div>
    </DesignerTooltip>
  )
})

function renderCount(count: number) {
  if (0 <= count && count < 1000) {
    return count
  }
  return '999+'
}
