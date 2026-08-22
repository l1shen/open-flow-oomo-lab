import type { Revision } from '../../src/base/common/revision.ts'
import type { ManifestPackageAuthoringProps } from '../../src/designer/common/manifestPackageAuthoring.ts'
import type { FlowEditOperation } from '../../src/manifest/common/flowEdit.ts'
import type { BlockPath, FlowPath, SearchPath } from '../../src/manifest/common/manifestTypes.ts'
import type { HandleName, NodeId } from '../../src/schema/index.ts'

import { describe, expect, it, vi } from 'vitest'
import { connect, disconnect } from '../../src/designer/browser/actions/nodeConnection.ts'
import { ManifestPackageAuthoring } from '../../src/designer/common/manifestPackageAuthoring.ts'
import { FlowEditError, planFlowEdit } from '../../src/manifest/common/flowEdit.ts'
import { createMemoryPackage, memoryFile } from '../support/memory-package-meta.ts'

const root = '/workspace' as SearchPath
const taskPath = `${root}/tasks/greet/task.oo.yaml` as BlockPath
const flowPath = `${root}/flows/main/flow.oo.yaml` as FlowPath
const revision = 'workspace-revision' as Revision

const taskSource = `title: Greet
private: false
inputs_def:
  - handle: name
    value: World
outputs_def:
  - handle: message
executor:
  name: javascript
  options:
    entry: main.ts
`

const flowSource = `title: Main
nodes:
  - node_id: producer
    task: self::greet
    inputs_from:
      - handle: name
        value: Alice
  - node_id: consumer
    task: self::greet
    inputs_from:
      - handle: name
        from_node:
          - node_id: producer
            output_handle: message
`

async function createAuthoring(resolveTaskEntryPath?: ManifestPackageAuthoringProps['resolveTaskEntryPath']) {
  const result = createMemoryPackage({
    root,
    packageSource: 'name: local-package\n',
    packageRevision: revision,
    files: [memoryFile(taskPath, taskSource, revision), memoryFile(flowPath, flowSource, revision)],
  })
  await result.packageMeta.sharedBlocks.refreshAll()
  const flowMeta = await result.packageMeta.flows.refreshFlow(flowPath, true)
  const authoring = new ManifestPackageAuthoring({ packageMeta: result.packageMeta, resolveTaskEntryPath })
  return { ...result, flowMeta, authoring }
}

describe('Manifest package authoring', () => {
  it('enables optional authoring operations unless the host disables them', async () => {
    const { context, packageMeta, authoring } = await createAuthoring()
    try {
      expect(authoring.canRenameSharedBlocks).toBe(true)
      expect(authoring.canWriteScriptlets).toBe(true)
      const restricted = new ManifestPackageAuthoring({ packageMeta, canRenameSharedBlocks: false, canWriteScriptlets: false })
      expect(restricted.canRenameSharedBlocks).toBe(false)
      expect(restricted.canWriteScriptlets).toBe(false)
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('lists local blocks and creates a source-backed task node', async () => {
    const { context, packageMeta, flowMeta, authoring } = await createAuthoring()
    try {
      const taskMeta = packageMeta.sharedBlocks.sharedBlocksByPath.get(taskPath)
      expect(taskMeta).toBeDefined()

      expect(authoring.getLocalBlock(taskPath)).toBe(taskMeta)
      const items = authoring.getAddNodeItems()
      expect(items).toEqual([expect.objectContaining({ name: 'greet', path: taskPath, title: 'Greet' })])

      const nodeId = authoring.addSharedBlockNode(flowMeta, taskMeta!)
      await Promise.resolve()
      const node = flowMeta.nodes.get(nodeId)
      expect(nodeId).toBe('greet#1')
      expect(node?.manifest.$.inputs_from.value).toEqual([expect.objectContaining({ handle: 'name', value: 'World' })])
      expect(flowMeta.manifest._toSaveFileString()).toContain('task: self::greet')
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('does not reuse a generated node ID after deletion', async () => {
    const { context, packageMeta, flowMeta, authoring } = await createAuthoring()
    try {
      const taskMeta = packageMeta.sharedBlocks.sharedBlocksByPath.get(taskPath)!
      const firstNodeId = authoring.addSharedBlockNode(flowMeta, taskMeta)
      await Promise.resolve()
      const firstNode = flowMeta.nodes.get(firstNodeId)!

      expect(firstNodeId).toBe('greet#1')
      expect(flowMeta.removeNodes(firstNode)).toBe(true)
      expect(authoring.addSharedBlockNode(flowMeta, taskMeta)).toBe('greet#2')
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('applies the same Flow graph operations as the shared Agent planner', async () => {
    const { context, packageMeta, flowMeta } = await createAuthoring()
    try {
      const addedConnection = {
        from: { nodeId: 'temporary' as NodeId, handle: 'value' as HandleName },
        to: { nodeId: 'consumer' as NodeId, handle: 'name' as HandleName },
      }
      const existingConnection = {
        from: { nodeId: 'producer' as NodeId, handle: 'message' as HandleName },
        to: { nodeId: 'consumer' as NodeId, handle: 'name' as HandleName },
      }
      const temporaryNode = { node_id: 'temporary' as NodeId, values: [{ handle: 'value' as HandleName, value: 1 }] }
      const replacementNode = {
        node_id: 'producer' as NodeId,
        task: 'self::greet' as const,
        inputs_from: [{ handle: 'name' as HandleName, value: 'Bob' }],
      }
      const operations: FlowEditOperation[] = [
        { type: 'add-node', node: temporaryNode },
        { type: 'replace-node', node: replacementNode },
        { type: 'connect', connection: addedConnection },
        { type: 'disconnect', connection: addedConnection },
        { type: 'disconnect', connection: existingConnection },
        { type: 'remove-node', nodeId: 'producer' as NodeId },
      ]
      const planned = planFlowEdit(flowSource, operations)

      flowMeta.upsertNodes({ type: 'value', data: temporaryNode })
      flowMeta.upsertNodes({ type: 'task', data: replacementNode })
      connect(flowMeta, {
        from: { type: 'from_node', source: { node_id: addedConnection.from.nodeId, output_handle: addedConnection.from.handle } },
        to: { type: 'to_node', target: { node_id: addedConnection.to.nodeId, input_handle: addedConnection.to.handle } },
      })
      disconnect(flowMeta, {
        from: { type: 'from_node', source: { node_id: addedConnection.from.nodeId, output_handle: addedConnection.from.handle } },
        to: { type: 'to_node', target: { node_id: addedConnection.to.nodeId, input_handle: addedConnection.to.handle } },
      })
      disconnect(flowMeta, {
        from: { type: 'from_node', source: { node_id: existingConnection.from.nodeId, output_handle: existingConnection.from.handle } },
        to: { type: 'to_node', target: { node_id: existingConnection.to.nodeId, input_handle: existingConnection.to.handle } },
      })
      expect(flowMeta.removeNodes(flowMeta.nodes.get('producer' as NodeId)!)).toBe(true)
      await Promise.resolve()

      expect(flowMeta.manifest._toSaveFileString()).toBe(planned.source)
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('requires Workbench Flow connections to be disconnected before node removal', async () => {
    const { context, packageMeta, flowMeta } = await createAuthoring()
    try {
      const producer = flowMeta.nodes.get('producer' as NodeId)!
      expect(() => flowMeta.removeNodes(producer)).toThrow(FlowEditError)
      expect(flowMeta.manifest._toSaveFileString()).toBe(flowSource)
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('preserves nonvisual input mappings while editing a visible Flow connection', async () => {
    const { context, packageMeta, flowMeta } = await createAuthoring()
    try {
      const consumer = flowMeta.nodes.get('consumer' as NodeId)!
      consumer.manifest.$$.inputs_from.set([...(consumer.manifest.$.inputs_from.value ?? []), { handle: 'legacy' as HandleName, value: 'keep' }])
      expect(consumer.$.handleInputsFrom.value?.some((input) => input.handle == 'legacy')).toBe(false)

      flowMeta.upsertNodes({
        type: 'value',
        data: { node_id: 'temporary' as NodeId, values: [{ handle: 'value' as HandleName, value: 1 }] },
      })
      connect(flowMeta, {
        from: { type: 'from_node', source: { node_id: 'temporary' as NodeId, output_handle: 'value' as HandleName } },
        to: { type: 'to_node', target: { node_id: 'consumer' as NodeId, input_handle: 'name' as HandleName } },
      })

      expect(consumer.manifest.$.inputs_from.value).toContainEqual({ handle: 'legacy', value: 'keep' })
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('updates task input and output references across the loaded flow', async () => {
    const { context, packageMeta, flowMeta, authoring } = await createAuthoring()
    try {
      const taskMeta = packageMeta.sharedBlocks.sharedBlocksByPath.get(taskPath)!
      authoring.propagateHandleRename(taskMeta, 'input', ['name', 'prompt'] as [HandleName, HandleName])
      authoring.propagateHandleRename(taskMeta, 'output', ['message', 'text'] as [HandleName, HandleName])
      await Promise.resolve()

      expect(flowMeta.nodes.get('producer' as NodeId)?.manifest.$.inputs_from.value).toEqual([expect.objectContaining({ handle: 'prompt', value: 'Alice' })])
      expect(flowMeta.nodes.get('consumer' as NodeId)?.manifest.$.inputs_from.value).toEqual([
        expect.objectContaining({
          handle: 'prompt',
          from_node: [expect.objectContaining({ node_id: 'producer', output_handle: 'text' })],
        }),
      ])

      const saved = flowMeta.manifest._toSaveFileString()
      expect(saved).toContain('handle: prompt')
      expect(saved).toContain('output_handle: text')
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })

  it('delegates task entry path resolution to the host boundary', async () => {
    const resolveTaskEntryPath = vi.fn(async () => '/workspace/tasks/greet/main.ts')
    const { context, packageMeta, authoring } = await createAuthoring(resolveTaskEntryPath)
    try {
      await expect(authoring.resolveTaskEntryPath(taskPath, 'main.ts')).resolves.toBe('/workspace/tasks/greet/main.ts')
      expect(resolveTaskEntryPath).toHaveBeenCalledWith(taskPath, 'main.ts')
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })
})
