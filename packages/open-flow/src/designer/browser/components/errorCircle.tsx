import styles from './errorCircle.module.scss'

import { clsx } from 'clsx'
import { memo } from 'react'
import { DesignerTooltip } from './tooltip.tsx'

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
    <DesignerTooltip placement="top" title={message}>
      <span className={styles.wrapper}>{i}</span>
    </DesignerTooltip>
  )
})
