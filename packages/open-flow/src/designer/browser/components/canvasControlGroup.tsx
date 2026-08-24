import styles from './canvasControlGroup.module.scss'
import type { HTMLAttributes, ReactNode } from 'react'

import { clsx } from 'clsx'

export interface CanvasControlGroupProps extends HTMLAttributes<HTMLDivElement> {
  readonly children: ReactNode
}

export function CanvasControlGroup({ children, className, ...props }: CanvasControlGroupProps): ReactNode {
  return (
    <div {...props} className={clsx(styles.group, className)} data-canvas-control-scope data-slot="canvas-control-group">
      {children}
    </div>
  )
}
