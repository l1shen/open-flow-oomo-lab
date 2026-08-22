import styles from './errorCircle.module.scss'
import type { TooltipProps } from 'antd'

import { Tooltip } from 'antd'
import { clsx } from 'clsx'
import { memo } from 'react'
import { defaultTooltipProps } from './label.tsx'

const errorTooltipProps: TooltipProps = {
  ...defaultTooltipProps,
  classNames: { root: styles.tooltip },
  placement: 'top',
}

export interface ErrorCircleProps {
  message?: React.ReactNode
  className?: string
}

export const ErrorCircle: React.FC<ErrorCircleProps> = memo(({ className, message }: ErrorCircleProps) => {
  const i = <i className={clsx(className, 'i-codicon:error', styles.icon)} />

  if (!message) {
    return i
  }

  return (
    <Tooltip {...errorTooltipProps} title={message}>
      <span className={styles.wrapper}>{i}</span>
    </Tooltip>
  )
})
