import styles from './label.module.scss'
import type { TooltipProps } from 'antd'

import { Tooltip } from 'antd'
import { clsx } from 'clsx'
import { forwardRef } from 'react'

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
 * Ant Design Tooltip attaches mouseenter and mouseleave handlers to its direct child.
 * Fragment or nested component children can prevent Tooltip from finding the DOM element.
 * Callers should therefore provide a plain HTML element as the direct child.
 * ```jsx
 * import { defaultTooltipProps } from './label.tsx'
 * return <Tooltip {...defaultTooltipProps} title="content"><Icon /></Tooltip>
 * ```
 */
export const defaultTooltipProps: TooltipProps = {
  arrow: false,
  mouseEnterDelay: 0.3,
  classNames: { root: styles.tooltip },
  placement: 'left',
  destroyOnHidden: true,
}

export const defaultTooltipRootClassName: string = styles.tooltip

export const Label: React.ForwardRefExoticComponent<LabelProps & React.RefAttributes<HTMLLabelElement>> = /*#__PURE__*/ forwardRef(function Label(
  props: LabelProps,
  ref?: React.Ref<HTMLLabelElement>,
) {
  return (
    <Tooltip {...defaultTooltipProps} classNames={{ root: clsx(styles.tooltip, props.tooltipClassName) }} title={props.title}>
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
            <Tooltip {...defaultTooltipProps} title={props.help} placement="top">
              <div className={styles.question}>
                <i className="i-codicon:question" />
              </div>
            </Tooltip>
          )}
        </div>
      </div>
    </Tooltip>
  )
})
