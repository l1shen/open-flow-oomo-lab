import styles from './NodeIndicator.module.scss'
import type { Rect, XYPosition } from '@xyflow/react'
import type { RFNodeId } from '../../base/rfHelpers.ts'

import { useReactFlow } from '@xyflow/react'
import { clsx } from 'clsx'
import { isEqual } from 'radash'
import React, { memo, useCallback, useEffect, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { compute } from 'value-enhancer'
import { getRFNodeType, isRectIntersect, RF_NODE_TYPE, toManifestNodeId } from '../../base/rfHelpers.ts'
import { RF_INPUT_NODE_ID } from '../../stores/node/inputNode.store.ts'
import { RF_OUTPUT_NODE_ID } from '../../stores/node/outputNode.store.ts'
import { useDesignerStore } from '../DesignerStoreContext.tsx'
import { usePaneRect$ } from '../Nodes/usePaneRect.ts'

export interface NodeIndicatorProps {
  readonly rfNodeId: RFNodeId
}

export const NodeIndicator: React.FC<NodeIndicatorProps> = /*#__PURE__*/ memo(function NodeIndicator(props: NodeIndicatorProps) {
  const rf = useReactFlow()
  const designerStore = useDesignerStore()
  const paneRect$ = usePaneRect$()
  const [hiding, setHiding] = useState(false)
  const [visible, setVisible] = useState(false)
  const [style, setStyle] = useState<React.CSSProperties>()

  const type = getRFNodeType(props.rfNodeId)
  const nodeId = toManifestNodeId(props.rfNodeId)
  const nodeStore = type === RF_NODE_TYPE.ManifestNode ? designerStore.$.nodes.get(nodeId) : designerStore.$.pseudoNodes?.get(nodeId)
  const title = useVal(nodeStore?.display$.title)

  const onClick = useCallback(
    (ev: React.MouseEvent) => {
      if (nodeStore) {
        const rfNode = nodeStore.$.rfNode.value
        if (rfNode) {
          const viewport = rf.getViewport()
          const mouse = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY })
          const x = rfNode.position.x + 50
          const y = rfNode.position.y + 50
          rf.setViewport(
            {
              x: viewport.x + (mouse.x - x) * viewport.zoom,
              y: viewport.y + (mouse.y - y) * viewport.zoom,
              zoom: viewport.zoom,
            },
            { duration: 150 },
          )
        }
      }
    },
    [rf, nodeStore],
  )

  useEffect(() => {
    interface Guide {
      visible: boolean
      style: React.CSSProperties | undefined
    }

    const guide$ = compute<Guide>(
      (get) => {
        const currentType = getRFNodeType(props.rfNodeId)
        const currentNodeId = toManifestNodeId(props.rfNodeId)
        const currentNodeStore =
          currentType === RF_NODE_TYPE.ManifestNode ? get(designerStore.$.nodes).get(currentNodeId) : get(designerStore.$.pseudoNodes)?.get(currentNodeId)

        if (currentNodeStore) {
          const { x, y } = get(currentNodeStore.$.position)
          const measured = get(currentNodeStore.$.measured)
          const zoom = get(designerStore.$.viewport)?.zoom ?? 1

          // Determine whether the node is inside the viewport.
          const paneRect = get(paneRect$)
          const smallerPaneRect: Rect = {
            x: paneRect.x + 200,
            y: paneRect.y + 100,
            width: paneRect.width - 400,
            height: paneRect.height - 200,
          }
          const padding = 30 / zoom + 4 * zoom
          const nodeRect: Rect = {
            x,
            y,
            width: measured?.width ?? 400,
            height: measured?.height ?? 200,
          }
          const nodeVisible = isRectIntersect(addPadding(smallerPaneRect, padding), nodeRect)

          if (nodeVisible) {
            return { visible: false, style: undefined }
          } else {
            const viewportX = paneRect.x + paneRect.width / 2
            const viewportY = paneRect.y + paneRect.height / 2
            const nodeX = x + (measured?.width ?? 0) / 2
            const nodeY = y + (measured?.height ?? 0) / 2

            const point = getRayIntersection(viewportX, viewportY, nodeX, nodeY, smallerPaneRect)

            if (point) {
              const adjustX = (point.x - viewportX) * zoom
              const adjustY = (point.y - viewportY) * zoom

              return {
                visible: true,
                style: {
                  ['--x']: `${adjustX / 1.5}px`,
                  ['--y']: `${adjustY / 1.5}px`,
                  ['--angle']: `${Math.atan2(-adjustY, -adjustX) * (180 / Math.PI)}deg`,
                } as React.CSSProperties,
              }
            }
          }
        }

        return { visible: false, style: undefined }
      },
      { equal: isEqual },
    )

    return guide$.subscribe((guide) => {
      setVisible(guide.visible)
      setStyle(guide.style)
    })
  }, [props.rfNodeId, designerStore, paneRect$])

  useEffect(() => {
    if (visible) {
      setHiding(false)

      const schedule = () => {
        const t1 = setTimeout(() => setHiding(true), 1000)
        const t2 = setTimeout(() => setVisible(false), 1500)

        return () => {
          clearTimeout(t1)
          clearTimeout(t2)
        }
      }

      let dispose = schedule()
      const stopListenViewport = designerStore.$.viewport.subscribe(() => {
        dispose()
        dispose = schedule()
      })

      return () => {
        stopListenViewport()
        dispose()
      }
    }
  }, [visible])

  if (!visible) {
    return null
  }

  return (
    <div className={clsx(styles.indicator, hiding && styles.hiding)} style={style} tabIndex={-1} onClick={onClick} title={title || nodeId}>
      <Bubble />
      {type === RF_NODE_TYPE.InputNode ? (
        <i className={clsx('i-carbon:port-input', styles.icon)} />
      ) : type === RF_NODE_TYPE.OutputNode ? (
        <i className={clsx('i-carbon:port-output', styles.icon)} />
      ) : (
        <span className={styles.title}>{title || nodeId}</span>
      )}
    </div>
  )
})

export const InOutNodeIndicators: React.FC = /*#__PURE__*/ memo(function InOutNodeIndicators() {
  return (
    <>
      <NodeIndicator rfNodeId={RF_INPUT_NODE_ID} />
      <NodeIndicator rfNodeId={RF_OUTPUT_NODE_ID} />
    </>
  )
})

function addPadding(rect: Rect, padding: number): Rect {
  return {
    x: rect.x + padding,
    y: rect.y + padding,
    width: rect.width - padding * 2,
    height: rect.height - padding * 2,
  }
}

function getRayIntersection(x0: number, y0: number, x1: number, y1: number, rect: Rect): XYPosition | undefined {
  return (
    getLineIntersection(x0, y0, x1, y1, rect.x, rect.y, rect.x + rect.width, rect.y) ||
    getLineIntersection(x0, y0, x1, y1, rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + rect.height) ||
    getLineIntersection(x0, y0, x1, y1, rect.x + rect.width, rect.y + rect.height, rect.x, rect.y + rect.height) ||
    getLineIntersection(x0, y0, x1, y1, rect.x, rect.y + rect.height, rect.x, rect.y)
  )
}

function getLineIntersection(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): XYPosition | undefined {
  const denom = (y3 - y2) * (x1 - x0) - (x3 - x2) * (y1 - y0)
  if (denom === 0) {
    return undefined // The lines are parallel.
  }

  const ua = ((x3 - x2) * (y0 - y2) - (y3 - y2) * (x0 - x2)) / denom
  const ub = ((x1 - x0) * (y0 - y2) - (y1 - y0) * (x0 - x2)) / denom

  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) {
    return undefined // The intersection is outside the line segments.
  }

  return { x: x0 + ua * (x1 - x0), y: y0 + ua * (y1 - y0) }
}

interface BubbleProps {}

const Bubble = /*#__PURE__*/ memo(function Bubble(_props: BubbleProps) {
  return (
    <svg fill="none" className={styles.bubble}>
      <path
        fill="var(--bubble-bg)"
        stroke="var(--bubble-border)"
        d="M26.833 11c0 2.69-.938 5.055-2.834 7.111-1.752 1.901-4.071 2.924-7.004 3.043l-.594.012H16.4c-2.089 0-4.41-.83-6.971-2.564C6.947 16.924 4.247 14.394 1.326 11 4.247 7.605 6.948 5.076 9.43 3.397 11.99 1.665 14.311.834 16.4.833l.595.012C19.927.965 22.247 1.989 24 3.89c1.896 2.056 2.834 4.42 2.834 7.11Z"
      />
    </svg>
  )
})
