import styles from './markdownPreview.module.scss'
import type { FC } from 'react'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { Viewport } from '../base/compare.ts'

import { clsx } from 'clsx'
import { lazy, memo, Suspense, useEffect, useRef, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { clamp } from '../base/trivial.ts'
import { createResizeHandle, MIN_NODE_WIDTH } from './resizeHandle.ts'

const MarkdownContent = lazy(() => import('./markdown/markdownContent.tsx'))

export interface MarkdownPreviewProps {
  dark$: ReadonlyVal<boolean>
  content: string
  defaultHeight?: number
  className?: string
  nodeContentWidth$?: Val<number | undefined>
  manualHeight$?: Val<number | undefined>
  viewport$?: ReadonlyVal<Viewport | undefined>
  draggable?: boolean
  onDoubleClick?: () => void
}

const defaultMinHeight = 100
const defaultMaxHeight = 400

export const MarkdownPreview: FC<MarkdownPreviewProps> = /* @__PURE__ */ memo(
  ({ dark$, content, defaultHeight, className, nodeContentWidth$, manualHeight$, viewport$, draggable, onDoubleClick }) => {
    const ref = useRef<HTMLDivElement>(null)
    const [focus, setFocus] = useState(false)
    const [height, setHeight] = useState(defaultHeight)
    const dark = useVal(dark$)

    useEffect(() => {
      const container = ref.current
      if (!container || !nodeContentWidth$ || !manualHeight$ || !viewport$) return
      let startWidth = 0
      let startHeight = 0
      return createResizeHandle({
        container: container,
        onResizeStart: () => {
          startWidth = nodeContentWidth$.value || MIN_NODE_WIDTH
          startHeight = manualHeight$.value || container.offsetHeight
        },
        onResize: (offsetX, offsetY) => {
          const scale = viewport$.value?.zoom || 1
          nodeContentWidth$.set(Math.max(MIN_NODE_WIDTH, startWidth + offsetX / scale))
          manualHeight$.set(Math.max(0, startHeight + offsetY / scale))
        },
      })
    }, [nodeContentWidth$, manualHeight$, viewport$])

    useEffect(() => {
      return manualHeight$?.subscribe((manualHeight) => {
        if (manualHeight) {
          setHeight(clamp(manualHeight, defaultMinHeight, defaultMaxHeight))
        }
      })
    }, [manualHeight$])

    return (
      <div
        ref={ref}
        tabIndex={-1}
        className={clsx(className, styles.container, draggable ? styles.draggable : 'nodrag', focus && 'nowheel', focus && 'designer-preview-active')}
        style={{ height }}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onDoubleClick={onDoubleClick}
      >
        <div className={`${styles.body} markdown-body`}>
          <Suspense fallback={null}>
            <MarkdownContent dark={dark} text={content} mermaid />
          </Suspense>
        </div>
      </div>
    )
  },
)
