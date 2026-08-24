import styles from './NodeStatusLabel.module.scss'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { Viewport } from '../../../base/compare.ts'
import type { FlowRunStatus } from '../../../stores/designer/typings.ts'
import type { NodeStatus } from '../../../stores/node/constants.ts'

import { isDefined } from '@wopjs/cast'
import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { Progress } from '../../../../../ui/browser/progress.tsx'
import { NODE_STATUS } from '../../../stores/node/constants.ts'
import { NodeTopLeftLabel } from './NodeTopLeftLabel.tsx'
import { useNodeStatus } from './useNodeStatus.ts'

export type NodeStatusLabelProps = {
  skip$: Val<boolean | undefined>
  nodeStatus$: ReadonlyVal<NodeStatus>
  flowStatus$: ReadonlyVal<FlowRunStatus>
  progress$?: ReadonlyVal<number | undefined>
  successCount$?: ReadonlyVal<number | undefined>
  viewport$: ReadonlyVal<Viewport | undefined>
}

export const NodeStatusLabel: React.FC<NodeStatusLabelProps> = /* @__PURE__ */ memo(
  ({ skip$, nodeStatus$, flowStatus$, progress$, successCount$, viewport$ }) => {
    const t = useTranslate()
    const skip = useVal(skip$, true)
    const progress = useVal(progress$, true)
    const { status, count } = useNodeStatus(nodeStatus$, flowStatus$, successCount$)

    if (skip) {
      return (
        <NodeTopLeftLabel viewport$={viewport$} as="button" onClick={() => skip$.set(!skip)}>
          <span className="inline-flex items-center">
            <i className={`${styles.icon} i-codicon:circle-slash`} />
            {t('nodeStatus.skipped')}
          </span>
        </NodeTopLeftLabel>
      )
    }

    switch (status) {
      case NODE_STATUS.Success: {
        return (
          <NodeTopLeftLabel viewport$={viewport$}>
            <NodeStatusIcon className={styles.icon} status={status} />
            <NodeStatusContent status={status} combo={count} />
          </NodeTopLeftLabel>
        )
      }
      case NODE_STATUS.Error: {
        return (
          <NodeTopLeftLabel viewport$={viewport$}>
            <NodeStatusIcon className={styles.icon} status={status} />
            <NodeStatusContent status={status} combo={count} />
          </NodeTopLeftLabel>
        )
      }
      case NODE_STATUS.Running: {
        return (
          <NodeTopLeftLabel viewport$={viewport$}>
            <NodeStatusIcon className={styles.icon} status={status} progress={progress} />
            <NodeStatusContent status={status} progress={progress} />
          </NodeTopLeftLabel>
        )
      }
      case NODE_STATUS.Waiting: {
        return (
          <NodeTopLeftLabel viewport$={viewport$}>
            <NodeStatusIcon className={styles.icon} status={status} />
            <NodeStatusContent status={status} />
          </NodeTopLeftLabel>
        )
      }
    }

    return null
  },
)

export interface NodeStatusIconProps {
  status: NodeStatus
  progress?: number
  className?: string
  loaderSize?: number
}

export const NodeStatusIcon: React.FC<NodeStatusIconProps> = ({ status, progress, className, loaderSize = 14 }) => {
  switch (status) {
    case NODE_STATUS.Success: {
      return <i className={clsx(className, styles.success, 'i-codicon:check')} />
    }
    case NODE_STATUS.Error: {
      return <i className={clsx(className, styles.error, 'i-codicon:error')} />
    }
    case NODE_STATUS.Running: {
      return progress == null ? (
        <i className={clsx(className, styles.running, 'i-codicon:loading', 'oo-designer-spin')} />
      ) : (
        <Progress
          className={clsx(className, styles.progress, 'pointer-events-none')}
          style={{ '--node-status-progress': `${Math.min(100, Math.max(0, progress))}%`, '--node-status-size': `${loaderSize}px` } as React.CSSProperties}
          value={progress}
        />
      )
    }
    case NODE_STATUS.Waiting: {
      return <i className={clsx(className, styles.waiting, 'i-carbon:time')} />
    }
  }
  return null
}

export interface NodeStatusContentProps {
  status: NodeStatus
  progress?: number
  combo?: number
}

export const NodeStatusContent: React.FC<NodeStatusContentProps> = ({ status, progress, combo = 0 }) => {
  const t = useTranslate()
  switch (status) {
    case NODE_STATUS.Success: {
      return (
        <span>
          {t('nodeStatus.success')}
          {combo > 1 ? ` \u{D7}${combo}` : ''}
        </span>
      )
    }
    case NODE_STATUS.Error: {
      return (
        <span>
          {t('nodeStatus.error')}
          {combo > 1 ? ` \u{D7}${combo}` : ''}
        </span>
      )
    }
    case NODE_STATUS.Running: {
      return (
        <span>
          {t('nodeStatus.running')}
          {isDefined(progress) && `(${Math.round(progress)}%)`}
        </span>
      )
    }
    case NODE_STATUS.Waiting: {
      return <span>{t('nodeStatus.waiting')}...</span>
    }
  }
  return null
}
