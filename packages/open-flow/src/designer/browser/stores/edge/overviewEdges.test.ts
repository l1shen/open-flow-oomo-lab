import type { Viewport } from '@xyflow/react'
import type { HandleName, NodeId } from '../../../../schema/index.ts'
import type { RFNodeId } from '../../base/rfHelpers.ts'
import type { NodeStatus } from '../node/constants.ts'
import type { NodeShowSettings, NodeStore } from '../node/node.store.ts'
import type { INodeSectionStore } from '../node/nodeSection/interface.ts'
import type { TriggerNodeStoreDisplay$ } from '../node/triggerNode.store.ts'
import type { ManifestConnection } from './typings.ts'

import { val } from 'value-enhancer'
import { reactiveMap } from 'value-enhancer/collections'
import { describe, expect, it } from 'vitest'
import { toRFNodeId } from '../../base/rfHelpers.ts'
import { DesignerUIStore } from '../designer/designerUI.store.ts'
import { NODE_STATUS } from '../node/constants.ts'
import { TriggerNodeStore } from '../node/triggerNode.store.ts'
import { EdgeStore } from './edge.store.ts'
import {
  deriveOverviewEdges,
  getOverviewEdgeId,
  OVERVIEW_EDGE_TYPE,
  OVERVIEW_INPUT_HANDLE_ID,
  OVERVIEW_OUTPUT_HANDLE_ID,
  projectOverviewEdges,
} from './overviewEdges.ts'

function nodeId(value: string): NodeId {
  return value as NodeId
}

function rfNodeId(value: string): RFNodeId {
  return toRFNodeId(nodeId(value))
}

function connection(source: string, sourceHandle: string, target: string, targetHandle: string): ManifestConnection {
  return {
    from: {
      type: 'from_node',
      source: {
        node_id: nodeId(source),
        output_handle: sourceHandle as HandleName,
      },
    },
    to: {
      type: 'to_node',
      target: {
        node_id: nodeId(target),
        input_handle: targetHandle as HandleName,
      },
    },
  }
}

describe('projectOverviewEdges', () => {
  it('groups parallel directed edges and deduplicates their error messages', () => {
    const source = rfNodeId('source')
    const target = rfNodeId('target')
    const reverse = rfNodeId('reverse')
    const overviewEdges = projectOverviewEdges([
      { rfEdge: { source, target }, error: 'First error' },
      { rfEdge: { source, target }, error: 'First error' },
      { rfEdge: { source, target }, error: 'Second error' },
      { rfEdge: { source: target, target: source } },
      { rfEdge: { source: reverse, target: reverse }, error: 'Self-loop error' },
    ])

    expect(overviewEdges).toHaveLength(3)
    expect(overviewEdges[0]).toEqual({
      id: getOverviewEdgeId(source, target),
      type: OVERVIEW_EDGE_TYPE,
      source,
      target,
      sourceHandle: OVERVIEW_OUTPUT_HANDLE_ID,
      targetHandle: OVERVIEW_INPUT_HANDLE_ID,
      selectable: false,
      deletable: false,
      reconnectable: false,
      focusable: false,
      data: {
        connectionCount: 3,
        dashed: false,
        errorCount: 3,
        errors: ['First error', 'Second error'],
        nodeSelected: false,
      },
    })
    expect(overviewEdges[1]).toMatchObject({
      source: target,
      target: source,
      data: {
        connectionCount: 1,
        dashed: false,
        errorCount: 0,
        errors: [],
        nodeSelected: false,
      },
    })
    expect(overviewEdges[2]).toMatchObject({
      source: reverse,
      target: reverse,
      data: {
        connectionCount: 1,
        dashed: false,
        errorCount: 1,
        errors: ['Self-loop error'],
        nodeSelected: false,
      },
    })
  })

  it('uses stable and unambiguous identifiers for node pairs', () => {
    const source = rfNodeId('source:with/slashes')
    const target = rfNodeId('target:with/slashes')

    expect(getOverviewEdgeId(source, target)).not.toBe(getOverviewEdgeId(target, source))
    expect(getOverviewEdgeId(rfNodeId('a:b'), rfNodeId('c'))).not.toBe(getOverviewEdgeId(rfNodeId('a'), rfNodeId('b:c')))
  })

  it('preserves the dashed-edge signal for declarative sources', () => {
    const source = rfNodeId('value')
    const target = rfNodeId('target')

    expect(projectOverviewEdges([{ rfEdge: { source, target }, dashed: true }])[0]?.data).toMatchObject({
      dashed: true,
    })
    expect(projectOverviewEdges([{ rfEdge: { source, target } }])[0]?.data?.dashed).toBe(false)
  })

  it('emphasizes an aggregate edge when either endpoint is selected', () => {
    const source = rfNodeId('source')
    const target = rfNodeId('target')

    expect(projectOverviewEdges([{ rfEdge: { source, target } }], new Set([target]))[0]?.data?.nodeSelected).toBe(true)
    expect(projectOverviewEdges([{ rfEdge: { source, target } }])[0]?.data?.nodeSelected).toBe(false)
  })
})

describe('deriveOverviewEdges', () => {
  it('renders Trigger source edges as dashed in detail and overview modes', () => {
    const nodes = reactiveMap<NodeId, NodeStore>()
    const designerUIStore = new DesignerUIStore({ nodeStores: nodes, viewport: val<Viewport | undefined>(undefined) })
    const triggerId = nodeId('trigger')
    const display$: TriggerNodeStoreDisplay$ = {
      description: val(undefined),
      icon: val(undefined),
      ignore: val<boolean | undefined>(false),
      inputs_def: val(undefined),
      outputs_def: val([{ handle: 'payload' as HandleName, json_schema: {} }]),
      progress: val<number | undefined>(undefined),
      sections: val<INodeSectionStore[]>([]),
      showSettings: val<NodeShowSettings | undefined>(undefined),
      status: val<NodeStatus>(NODE_STATUS.Idle),
      title: val(undefined),
      trigger: val(undefined),
    }
    const triggerNode = new TriggerNodeStore(triggerId, { designerUIStore, display$ })
    nodes.set(triggerId, triggerNode)
    const edge = new EdgeStore('trigger-edge' as EdgeStore['edgeId'], {
      nodes,
      connection: connection('trigger', 'payload', 'target', 'input'),
    })
    const stores$ = val<readonly EdgeStore[]>([edge])
    const selectedNodeIds$ = val<ReadonlySet<string>>(new Set())
    const overviewEdges$ = deriveOverviewEdges(stores$, selectedNodeIds$)

    expect(edge.$.connectionMeta.value).toEqual({ dashed: true, muted: false })
    expect(overviewEdges$.value[0]?.data?.dashed).toBe(true)

    edge.dispose()
    triggerNode.dispose()
    designerUIStore.dispose()
    overviewEdges$.dispose()
  })

  it('reacts to canonical edge errors without replacing canonical stores', () => {
    const nodes = reactiveMap<NodeId, NodeStore>()
    const first = new EdgeStore('first' as EdgeStore['edgeId'], {
      nodes,
      connection: connection('source', 'one', 'target', 'one'),
    })
    const second = new EdgeStore('second' as EdgeStore['edgeId'], {
      nodes,
      connection: connection('source', 'two', 'target', 'two'),
    })
    const stores$ = val<readonly EdgeStore[]>([first, second])
    const selectedNodeIds$ = val<ReadonlySet<string>>(new Set())
    const overviewEdges$ = deriveOverviewEdges(stores$, selectedNodeIds$)

    expect(overviewEdges$.value[0]?.data).toEqual({
      connectionCount: 2,
      dashed: false,
      errorCount: 0,
      errors: [],
      nodeSelected: false,
    })

    first.$$.error.set('Invalid connection')
    second.$$.error.set('Invalid connection')

    expect(overviewEdges$.value[0]?.data).toEqual({
      connectionCount: 2,
      dashed: false,
      errorCount: 2,
      errors: ['Invalid connection'],
      nodeSelected: false,
    })
    expect(stores$.value).toEqual([first, second])

    selectedNodeIds$.set(new Set([rfNodeId('source')]))
    expect(overviewEdges$.value[0]?.data?.nodeSelected).toBe(true)

    first.dispose()
    second.dispose()
    overviewEdges$.dispose()
  })
})
