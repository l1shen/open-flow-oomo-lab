import styles from './schemaEditor.module.scss'
import type { useStoreApi } from '@xyflow/react'
import type { Val } from 'value-enhancer'

import { useCallback } from 'react'

export function useHandleTrack(
  minWidth: number,
  width$: Val<number | undefined>,
  containerRef: React.RefObject<HTMLDivElement | null>,
  reactFlowStore?: ReturnType<typeof useStoreApi>,
): (event: React.PointerEvent<HTMLDivElement>) => void {
  return useCallback(
    (event: React.PointerEvent<HTMLDivElement>): void => {
      if (!event.isPrimary || event.target !== event.currentTarget || (event.button != null && event.button !== 0)) {
        return
      }

      const deltaDirection = 1

      const reactFlowState = reactFlowStore?.getState()

      event.preventDefault()
      event.stopPropagation()

      const startPointerX = event.clientX

      const scale = reactFlowState?.transform[2] || 1

      const startWidth = width$.value !== undefined ? Math.max(minWidth, width$.value) : minWidth

      const mask = document.createElement('div')
      mask.className = styles.mask
      if (reactFlowState?.domNode) {
        reactFlowState.domNode.append(mask)
      }

      function handleTrackMove(pointerEvent: PointerEvent): void {
        if (!pointerEvent.isPrimary) {
          return
        }

        if (pointerEvent.buttons <= 0) {
          handleTrackEnd()
          return
        }

        pointerEvent.preventDefault()
        pointerEvent.stopPropagation()

        const nodeDeltaX = ((pointerEvent.clientX - startPointerX) / scale) * deltaDirection

        const width = Math.max(minWidth, startWidth + nodeDeltaX)

        width$.set(width)
        containerRef.current?.style.setProperty('width', `${width}px`)
      }

      function handleTrackEnd(): void {
        mask.remove()
        window.removeEventListener('pointermove', handleTrackMove)
        window.removeEventListener('pointerup', handleTrackEnd)
        window.removeEventListener('pointercancel', handleTrackEnd)
        window.removeEventListener('blur', handleTrackEnd)
      }

      window.addEventListener('pointermove', handleTrackMove)
      window.addEventListener('pointerup', handleTrackEnd, { passive: true })
      window.addEventListener('pointercancel', handleTrackEnd, {
        passive: true,
      })
      window.addEventListener('blur', handleTrackEnd, { passive: true })
    },
    [minWidth, width$, reactFlowStore],
  )
}
