import styles from './NodeTopLeftLabel.module.scss'
import type { ReadonlyVal } from 'value-enhancer'
import type { Viewport } from '../../../base/compare.ts'

import { clsx } from 'clsx'
import { createElement } from 'react'
import { useDerived } from 'use-value-enhancer'
import { lerp } from '../../../base/trivial.ts'

const MinZoom = 0.2
const MinTop = -40
const MaxTop = -24
const MinBorderRadius = 3
const MaxBorderRadius = 5
const MinFontSize = 12
const MaxFontSize = 13

export interface NodeTopLeftLabelProps {
  viewport$: ReadonlyVal<Viewport | undefined>
  as?: string
  className?: string
  onClick?: (event: React.MouseEvent<HTMLElement>) => void
  children?: React.ReactNode
}

export const NodeTopLeftLabel: React.FC<NodeTopLeftLabelProps> = ({ viewport$, as = 'div', className, onClick, children }) => {
  const style = useDerived(
    viewport$,
    (viewport) => {
      const borderRadius = viewport ? lerp((viewport.zoom - MinZoom) / (1 - MinZoom), MinBorderRadius, MaxBorderRadius) : 5
      const scale = viewport ? lerp((1 / viewport.zoom - 1) / (1 / MinZoom - 1), 1, (MinFontSize * 5) / MaxFontSize) : 1
      const top = viewport ? lerp((viewport.zoom - MinZoom) / (1 - MinZoom), MinTop, MaxTop) : 5

      return {
        top: `${Math.max(Math.min(top, MaxTop), MinTop)}px`,
        borderRadius: `${Math.min(borderRadius, MaxBorderRadius)}px`,
        transform: `scale(${Math.max(scale, 1)})`,
      }
    },
    true,
  )

  return createElement(as, { style, className: clsx(className, styles.label), onClick, children })
}
