import styles from './label.module.scss'

import { clsx } from 'clsx'
import { forwardRef } from 'react'
import { DesignerTooltip } from './tooltip.tsx'

export interface LabelProps {
  htmlFor?: string
  className?: string
  wrapperClassName?: string
  tooltipClassName?: string
  style?: React.CSSProperties
  /** Only style changes. */
  disabled?: boolean
  title?: string
  htmlTitle?: string
  help?: string
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  children?: React.ReactNode
  isSuffix?: boolean
  onClick?: React.MouseEventHandler
}

/**
 * Tooltips attach mouseenter and mouseleave handlers to their direct child.
 * Fragment or nested component children can prevent Tooltip from finding the DOM element.
 * Callers should therefore provide a plain HTML element as the direct child.
 * ```jsx
 * return <DesignerTooltip title="content"><Icon /></DesignerTooltip>
 * ```
 */
export const defaultTooltipClassName: string = styles.tooltip

export const Label: React.ForwardRefExoticComponent<LabelProps & React.RefAttributes<HTMLLabelElement>> = /*#__PURE__*/ forwardRef(function Label(
  props: LabelProps,
  ref?: React.Ref<HTMLLabelElement>,
) {
  return (
    <DesignerTooltip className={clsx(styles.tooltip, props.tooltipClassName)} placement="left" title={props.title}>
      <div
        className={clsx(styles.wrapper, props.wrapperClassName, props.disabled && styles.disabled, props.isSuffix && styles.isSuffix)}
        title={props.htmlTitle}
      >
        <div className={clsx(styles.label, props.className)} onClick={props.onClick}>
          {props.prefix && <div className={styles.prefix}>{props.prefix}</div>}
          <label ref={ref} htmlFor={props.htmlFor} style={props.style}>
            {props.children}
          </label>
          {props.suffix && <div className={styles.suffix}>{props.suffix}</div>}
          {props.help && (
            <DesignerTooltip placement="top" title={props.help}>
              <div className={styles.question}>
                <i className="i-codicon:question" />
              </div>
            </DesignerTooltip>
          )}
        </div>
      </div>
    </DesignerTooltip>
  )
})
