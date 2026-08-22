import styles from './resizeHandle.module.scss'
import type { Disposer } from '@wopjs/disposable'

export const MIN_NODE_WIDTH = 200

interface ResizeHandleProps {
  container: HTMLDivElement
  onResizeStart?: () => void
  onResize?: (offsetX: number, offsetY: number) => void
  onResizeEnd?: () => void
}

export const createResizeHandle = ({ container, onResizeStart, onResize, onResizeEnd }: ResizeHandleProps): Disposer => {
  const resizerEl = document.createElement('div')
  resizerEl.className = `${styles['resize-handle']} i-carbon:draggable`

  container.appendChild(resizerEl)

  let startX = 0
  let startY = 0

  const onMove = (e: PointerEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    onResize?.(e.clientX - startX, e.clientY - startY)
  }

  const onEnd = (e: PointerEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    resizerEl.removeEventListener('pointerup', onEnd)
    resizerEl.removeEventListener('pointercancel', onEnd)
    resizerEl.removeEventListener('pointermove', onMove)
    onResizeEnd?.()
  }

  const onStart = (e: PointerEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    startX = e.clientX
    startY = e.clientY
    resizerEl.setPointerCapture(e.pointerId)
    resizerEl.addEventListener('pointerup', onEnd)
    resizerEl.addEventListener('pointercancel', onEnd)
    resizerEl.addEventListener('pointermove', onMove)
    onResizeStart?.()
  }
  resizerEl.addEventListener('pointerdown', onStart)

  return () => {
    resizerEl.removeEventListener('pointerdown', onStart)
    resizerEl.removeEventListener('pointerup', onEnd)
    resizerEl.removeEventListener('pointercancel', onEnd)
    resizerEl.removeEventListener('pointermove', onMove)
    if (resizerEl.parentNode) {
      resizerEl.remove()
    }
  }
}
