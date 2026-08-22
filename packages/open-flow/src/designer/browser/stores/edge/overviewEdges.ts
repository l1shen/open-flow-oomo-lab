import type { Edge } from '@xyflow/react'
import type { ReadonlyVal } from 'value-enhancer'
import type { RFEdge, RFHandleName } from '../../base/rfHelpers.ts'
import type { EdgeStore } from './edge.store.ts'

import { compute } from 'value-enhancer'

export const OVERVIEW_EDGE_TYPE = 'overview'
export const OVERVIEW_INPUT_HANDLE_ID = 'overview:input' as RFHandleName
export const OVERVIEW_OUTPUT_HANDLE_ID = 'overview:output' as RFHandleName

export interface OverviewEdgeData extends Record<string, unknown> {
  readonly connectionCount: number
  readonly dashed: boolean
  readonly errorCount: number
  readonly errors: readonly string[]
  readonly nodeSelected: boolean
}

export type OverviewRFEdge = Edge<OverviewEdgeData, typeof OVERVIEW_EDGE_TYPE>
export type RenderedRFEdge = RFEdge | OverviewRFEdge

export interface OverviewEdgeProjectionSource {
  readonly rfEdge: Pick<RFEdge, 'source' | 'target'>
  readonly dashed?: boolean
  readonly error?: string
}

interface MutableOverviewEdgeGroup {
  readonly source: string
  readonly target: string
  connectionCount: number
  dashed: boolean
  errorCount: number
  readonly errors: string[]
  readonly errorSet: Set<string>
}

export function deriveOverviewEdges(
  edgeStores$: ReadonlyVal<readonly EdgeStore[]>,
  selectedNodeIds$: ReadonlyVal<ReadonlySet<string>>,
): ReadonlyVal<OverviewRFEdge[]> {
  return compute((get) => {
    const sources: OverviewEdgeProjectionSource[] = []
    for (const edgeStore of get(edgeStores$)) {
      const rfEdge = get(edgeStore.$.rfEdge)
      if (rfEdge) {
        sources.push({
          rfEdge,
          dashed: get(edgeStore.$.connectionMeta)?.dashed,
          error: get(edgeStore.$.error),
        })
      }
    }
    return projectOverviewEdges(sources, get(selectedNodeIds$))
  })
}

export function projectOverviewEdges(sources: readonly OverviewEdgeProjectionSource[], selectedNodeIds?: ReadonlySet<string>): OverviewRFEdge[] {
  const groups = new Map<string, MutableOverviewEdgeGroup>()

  for (const { rfEdge, dashed, error } of sources) {
    const id = getOverviewEdgeId(rfEdge.source, rfEdge.target)
    let group = groups.get(id)
    if (!group) {
      const newGroup: MutableOverviewEdgeGroup = {
        source: rfEdge.source,
        target: rfEdge.target,
        connectionCount: 0,
        dashed: false,
        errorCount: 0,
        errors: [],
        errorSet: new Set(),
      }
      groups.set(id, newGroup)
      group = newGroup
    }

    group.connectionCount++
    if (dashed) {
      group.dashed = true
    }
    if (error) {
      group.errorCount++
      if (!group.errorSet.has(error)) {
        group.errorSet.add(error)
        group.errors.push(error)
      }
    }
  }

  return Array.from(groups, ([id, group]) => ({
    id,
    type: OVERVIEW_EDGE_TYPE,
    source: group.source,
    target: group.target,
    sourceHandle: OVERVIEW_OUTPUT_HANDLE_ID,
    targetHandle: OVERVIEW_INPUT_HANDLE_ID,
    selectable: false,
    deletable: false,
    reconnectable: false,
    focusable: false,
    data: {
      connectionCount: group.connectionCount,
      dashed: group.dashed,
      errorCount: group.errorCount,
      errors: group.errors,
      nodeSelected: selectedNodeIds?.has(group.source) === true || selectedNodeIds?.has(group.target) === true,
    },
  }))
}

export function getOverviewEdgeId(source: string, target: string): string {
  return `overview:${encodeURIComponent(source)}:${encodeURIComponent(target)}`
}
