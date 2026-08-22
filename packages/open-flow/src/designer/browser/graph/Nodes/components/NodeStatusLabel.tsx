import styles from './NodeStatusLabel.module.scss'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { Viewport } from '../../../base/compare.ts'
import type { FlowRunStatus } from '../../../stores/designer/typings.ts'
import type { NodeStatus } from '../../../stores/node/constants.ts'

import { CheckCircleOutlined, CloseCircleOutlined, HourglassOutlined, LoadingOutlined } from '@ant-design/icons'
import { isDefined, returnsEmptyString } from '@wopjs/cast'
import { Progress } from 'antd'
import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
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
      return <CheckCircleOutlined className={clsx(className, 'color-#52c41a')} />
    }
    case NODE_STATUS.Error: {
      return <CloseCircleOutlined className={clsx(className, 'color-#eb2f96')} />
    }
    case NODE_STATUS.Running: {
      return progress == null ? (
        <LoadingOutlined spin className={clsx(className, 'color-[--brand-highlight-color]')} />
      ) : (
        <Progress
          type="circle"
          percent={progress}
          size={loaderSize}
          strokeColor={'var(--brand-highlight-color)'}
          strokeWidth={10}
          format={returnsEmptyString}
          className={clsx(className, 'pointer-events-none')}
        />
      )
    }
    case NODE_STATUS.Waiting: {
      return <HourglassOutlined className={clsx(className, 'color-[--text-2]')} />
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
