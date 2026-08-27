import styles from './dragNDrop.module.scss'
import type { HandleIndex } from '../../stores/node/constants.ts'
import type { ConditionsSectionStore } from '../../stores/node/nodeSection/conditionsSection.store.ts'
import type { InputSectionStore } from '../../stores/node/nodeSection/inputSection.store.ts'
import type { OutputSectionStore } from '../../stores/node/nodeSection/outputSection.store.ts'
import type { SubflowInputSectionStore } from '../../stores/node/nodeSection/subflowInputSection.store.ts'
import type { SubflowOutputSectionStore } from '../../stores/node/nodeSection/subflowOutputSection.store.ts'
import type { ValueSectionStore } from '../../stores/node/nodeSection/valueSection.store.ts'

import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp } from '../../base/trivial.ts'
import { ConditionRowStore } from '../../stores/conditionHandle/conditionRow.store.ts'
import { HandleRowStore } from '../../stores/nodeHandle/handleRow.store.ts'

export interface DragNDropContext {
  dragHandle: HandleIndex | undefined
  dragTarget: HandleIndex | undefined
  dragPosition: number
  onDragStart: (ev: React.DragEvent<HTMLElement>, item: HandleRowStore | ConditionRowStore | string) => void
  onDragOver: (ev: React.DragEvent<HTMLElement>, item: HandleRowStore | ConditionRowStore | string | null) => void
  onDragEnd: (ev: React.DragEvent<HTMLElement>) => void
  onDrop: (ev: React.DragEvent<HTMLElement>) => void
}

export function setHandleDragImage(ev: React.DragEvent<HTMLElement>, label: string): () => void {
  const canvas = ev.currentTarget.closest('.oo-designer-root')
  if (canvas == null) return () => undefined
  const image = document.createElement('div')
  const icon = document.createElement('i')
  const text = document.createElement('span')
  image.className = styles.dragImage
  icon.className = 'i-carbon:draggable'
  text.className = styles.label
  text.textContent = label
  image.append(icon, text)
  canvas.append(image)
  ev.dataTransfer.setDragImage(image, 12, 12)
  return () => image.remove()
}

export function useDragAndDrop(
  handles: (HandleRowStore | ConditionRowStore | string)[],
  section: InputSectionStore | OutputSectionStore | ValueSectionStore | SubflowInputSectionStore | SubflowOutputSectionStore | ConditionsSectionStore,
): DragNDropContext {
  const [dragHandle, setDragHandle] = useState<HandleIndex>()
  const [additional, setAdditional] = useState(false)
  const [dragTarget, setDragTarget] = useState<HandleIndex>()
  const [dragPosition, setDragPosition] = useState<number>(0)
  const removeDragImage = useRef<() => void>(() => undefined)

  useEffect(() => () => removeDragImage.current(), [])

  const onDragStart = useCallback(
    (ev: React.DragEvent<HTMLElement>, item: HandleRowStore | ConditionRowStore | string) => {
      if (HandleRowStore.is(item) || ConditionRowStore.is(item)) {
        section.onDragStart(item.name)
      }
      removeDragImage.current()
      removeDragImage.current = setHandleDragImage(ev, typeof item == 'string' ? item : item.name)
      setDragHandle(getIndex(item))
      setAdditional(getAdditional(item))
    },
    [section],
  )

  const onDragOver = useCallback(
    (ev: React.DragEvent<HTMLElement>, item: HandleRowStore | ConditionRowStore | string | null) => {
      ev.preventDefault()
      if (dragHandle) {
        if (item == null) {
          setDragTarget(undefined)
          setDragPosition(0)
          return
        }
        const target = getIndex(item)
        setDragTarget((value) => (isSameIndex(value, target) ? value : target))
        if (isSameIndex(dragHandle, target) || additional !== getAdditional(item)) {
          setDragPosition(0)
        } else {
          const a = handles.findIndex((h) => matchesIndex(h, dragHandle))
          const b = handles.findIndex((h) => matchesIndex(h, target))
          setDragPosition(b - a)
        }
      }
    },
    [dragHandle, additional, handles],
  )

  const onDrop = useCallback(
    (ev: React.DragEvent<HTMLElement>) => {
      ev.preventDefault()
      if (dragHandle && dragTarget && dragPosition) {
        let i = handles.findIndex((h) => matchesIndex(h, dragTarget))
        if (getAdditional(handles[i])) {
          const countNoAdditional = handles.findIndex((h) => getAdditional(h))
          i = clamp(i - countNoAdditional, 0, handles.length - countNoAdditional - 1)
        }
        section.moveHandle(dragHandle, i)
      }
      setDragPosition(0)
      setDragHandle(undefined)
      removeDragImage.current()
      removeDragImage.current = () => undefined
    },
    [dragHandle, dragTarget, dragPosition, section, handles],
  )

  const onDragEnd = useCallback((ev: React.DragEvent<HTMLElement>) => {
    ev.preventDefault()
    setDragPosition(0)
    setDragHandle(undefined)
    removeDragImage.current()
    removeDragImage.current = () => undefined
  }, [])

  return {
    dragHandle,
    dragTarget,
    dragPosition,
    onDragStart,
    onDragOver,
    onDragEnd,
    onDrop,
  }
}

function getAdditional(item: string | HandleRowStore | ConditionRowStore) {
  return HandleRowStore.is(item) ? item.context.additional : false
}

function getIndex(item: HandleRowStore | ConditionRowStore | string): HandleIndex {
  return HandleRowStore.is(item) || ConditionRowStore.is(item) ? { handle: item.name } : { group: item }
}

function isSameIndex(a: HandleIndex | undefined, b: HandleIndex | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  if (a.handle == null && b.handle == null) {
    return a.group === b.group
  } else {
    return a.handle === b.handle
  }
}

function matchesIndex(h: string | HandleRowStore | ConditionRowStore, index: HandleIndex): boolean {
  if (HandleRowStore.is(h) || ConditionRowStore.is(h)) {
    return h.name === index.handle
  } else {
    return index.handle == null && h === index.group
  }
}
