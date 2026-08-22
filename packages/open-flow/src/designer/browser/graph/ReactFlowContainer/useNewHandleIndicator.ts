import type { HandleName } from '../../../../schema/index.ts'
import type { RFHandleName, RFNodeId } from '../../base/rfHelpers.ts'
import type { IAddHandleOptions } from '../../stores/designer/designer.store.ts'
import type { HandleIndex } from '../../stores/node/constants.ts'

import { Position } from '@xyflow/react'
import { HANDLE_ROW_CLASSNAME, NODE_HANDLE_CLASSNAME } from '../../base/designer.ts'
import { getRFNodeType, RF_NODE_TYPE, toManifestHandleName, toManifestNodeId } from '../../base/rfHelpers.ts'
import { LEFT_TO_SECTION_TYPES, PSEUDO_SECTION_TYPES, RIGHT_TO_SECTION_TYPES } from '../../stores/node/nodeSection/constants.ts'

export interface AddHandleIndicator extends IAddHandleOptions {
  // Equal to $handleRow || $section. Nested object and array items resolve to the last handle row.
  dropZone: Element | null | undefined
}

export function getNewHandleIndicator(
  fromNode: string | null | undefined,
  fromPosition: Position | null | undefined,
  fromHandle: string | null | undefined,
  $section_: Element | null | undefined,
  $handleRow: Element | null | undefined,
  insertBefore: boolean | undefined,
): AddHandleIndicator | null {
  const $section = $section_ as Partial<HTMLElement> | null | undefined

  if (fromNode && fromPosition && fromHandle && $section) {
    const fromNodeId = toManifestNodeId(fromNode as RFNodeId)

    const $node = $section.closest?.('.react-flow__node') as Partial<HTMLElement> | null
    const toRFNodeId = $node?.dataset?.id as RFNodeId | null | undefined
    const toNodeId = toRFNodeId && toManifestNodeId(toRFNodeId)
    // Do not create a handle when the target is absent or is the source node.
    if (!toNodeId || toNodeId === fromNodeId) {
      return null
    }

    // Do not create a handle when the target has no add-handle action.
    if (!$section.querySelector?.(`.${NODE_HANDLE_CLASSNAME} .i-codicon\\:add`)) {
      return null
    }

    // A non-draggable handle cannot accept an inline schema edit, so fall back to the section.
    if ($handleRow && !$handleRow.querySelector('[class*="_dragHandle_"]')) {
      $handleRow = null
    }

    const fromFlow = getRFNodeType(fromNode as RFNodeId) !== RF_NODE_TYPE.ManifestNode
    const toSection = $section.dataset?.section as string
    const fromHandleName = toManifestHandleName(fromHandle as RFHandleName)
    const $handle = findHandleElement($handleRow)
    const $lastHandleRow = findLastHandleRow($handleRow)
    const toDataHandle = $handle?.dataset?.handle as string | null | undefined
    const toHandleIndex = decodeHandleIndex(toDataHandle)
    const toFlow = PSEUDO_SECTION_TYPES.includes(toSection)
    const dropZone = $lastHandleRow || ($section as Element)

    // Handles dragged to the left can extend value, output, and subflow-input sections.
    // These sections are mutually exclusive for the supported node shapes.
    if (fromPosition === Position.Left && LEFT_TO_SECTION_TYPES.includes(toSection)) {
      return {
        fromFlow,
        fromNodeId,
        fromPosition,
        fromHandleName,
        toFlow,
        toNodeId,
        toHandleIndex,
        toSection,
        dropZone,
        insertBefore,
      }
    }

    // Handles dragged to the right can create inputs and subflow outputs.
    if (fromPosition === Position.Right && RIGHT_TO_SECTION_TYPES.includes(toSection)) {
      return {
        fromFlow,
        fromNodeId,
        fromPosition,
        fromHandleName,
        toFlow,
        toNodeId,
        toHandleIndex,
        toSection,
        dropZone,
        insertBefore,
      }
    }
  }

  return null
}

function findHandleElement($handleRow: Element | null | undefined): Partial<HTMLElement> | null {
  // Walk upward when hovering a nested object or array item to find its handle.
  while ($handleRow) {
    const $handle = $handleRow.querySelector('[data-handle]') as Partial<HTMLElement> | null
    if ($handle) {
      return $handle
    }

    $handleRow = $handleRow.previousElementSibling
    if (!$handleRow || !$handleRow.classList.contains(HANDLE_ROW_CLASSNAME)) {
      return null
    }
  }

  return null
}

function findLastHandleRow($handleRow_: Element | null | undefined): Element | null | undefined {
  let $handleRow = $handleRow_ as (Element & Partial<HTMLElement>) | null

  // Walk downward from a nested item to find the last non-root handle row.
  while ($handleRow) {
    const nextSibling = $handleRow.nextElementSibling as (Element & Partial<HTMLElement>) | null
    if (isTopLevel(nextSibling?.dataset?.level)) {
      return $handleRow
    }

    $handleRow = nextSibling
  }

  return null
}

function isTopLevel(level: string | null | undefined): boolean {
  return !level || level === '0'
}

function decodeHandleIndex(value: string | null | undefined): HandleIndex | null {
  if (value) {
    if (value[1] === ':') {
      if (value[0] === 'g') return { group: value.slice(2) }
      if (value[0] === 'h') return { handle: value.slice(2) as HandleName }
    }
    return { handle: value as HandleName }
  }

  return null
}

export function getInsertBefore($section: Element | null | undefined, y: number): boolean | undefined {
  if ($section) {
    const bounds = $section.getBoundingClientRect()
    if (y < bounds.top + bounds.height / 3) {
      return true
    }
  }

  return undefined
}
