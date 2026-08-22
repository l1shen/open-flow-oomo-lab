import styles from './NodeProgress.module.scss'
import type { ReadonlyVal } from 'value-enhancer'
import type { NodeStatus } from '../../../stores/node/constants.ts'

import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'

export interface NodeProgressProps {
  variant?: 'default' | 'minimap'
  progress$?: ReadonlyVal<number | undefined>
  status$?: ReadonlyVal<NodeStatus | undefined>
}

export const NodeProgress: React.FC<NodeProgressProps> = /* @__PURE__ */ memo(({ variant, progress$, status$ }) => {
  const progress = useVal(progress$, false)
  const status = useVal(status$, false)

  return <progress className={clsx(styles.progress, variant === 'minimap' && styles.minimap, styles[status ?? 'idle'])} value={(progress ?? 0) / 100} />
})
