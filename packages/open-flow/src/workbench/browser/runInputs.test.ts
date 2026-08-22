import type { Revision } from '../../base/common/revision.ts'
import type { BlockPath, FlowPath, SearchPath } from '../../manifest/common/manifestTypes.ts'
import type { HandleInputFrom, HandleName, InputHandleDef, NodeId } from '../../schema/index.ts'
import type { TriggerCatalogDescriptor } from '../../trigger/common/catalog.ts'

import { val } from 'value-enhancer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryPackage, memoryFile } from '../../../test/support/memory-package-meta.ts'
import { ObjectWidgetStore } from '../../designer/browser/stores/nodeHandle/objectWidget.store.ts'
import { resolveWorkbenchTriggerInvocation, resolveWorkbenchTriggerRunTargets, WorkbenchRunInputs, WorkbenchTriggerRunInputs } from './runInputs.ts'

function handleName(value: string): HandleName {
  return value as HandleName
}

function nodeId(value: string): NodeId {
  return value as NodeId
}

function trigger(name: string): TriggerCatalogDescriptor {
  return {
    config: {},
    definition: {
      config_schema: { additionalProperties: false, type: 'object' },
      name,
      provisioning: { kind: 'webhook' },
      payload_schema: {
        additionalProperties: false,
        properties: { message: { type: 'string' } },
        required: ['message'],
        type: 'object',
      },
      service_id: 'open-flow',
      service_name: 'Open Flow',
    },
    revision: '1',
    type: 'open-flow.webhook',
  }
}

function from(handle: string, sourceNodeId: string, outputHandle = 'payload'): HandleInputFrom {
  return {
    from_node: [{ node_id: nodeId(sourceNodeId), output_handle: handleName(outputHandle) }],
    handle: handleName(handle),
  }
}

beforeEach(() => {
  vi.stubGlobal('cancelIdleCallback', vi.fn())
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn(() => 1),
  )
})

afterEach(() => vi.unstubAllGlobals())

describe('WorkbenchRunInputs', () => {
  it('keeps explicit invocation values separate from definition defaults', () => {
    const definitions = val<InputHandleDef[]>([
      { handle: handleName('name'), json_schema: { type: 'string' }, value: 'World' },
      { handle: handleName('optional'), json_schema: { type: 'string' }, nullable: true },
    ])
    const lang = val('en')
    const inputs = new WorkbenchRunInputs(definitions, lang)

    expect(inputs.hasInputs).toBe(true)
    expect(inputs.values()).toEqual({})
    expect(inputs.replaceValues({ ignored: 'value', name: 'Ada' })).toBe(false)
    expect(inputs.replaceValues({ name: 'Ada', optional: null })).toBe(true)
    expect(inputs.values()).toEqual({ name: 'Ada', optional: null })
    expect(inputs.replaceValues([])).toBe(false)

    inputs.dispose()
    definitions.dispose()
    lang.dispose()
  })

  it('adds, edits, renames, and removes fields allowed by an open object schema', () => {
    const definitions = val<InputHandleDef[]>([
      {
        handle: handleName('payload'),
        json_schema: { additionalProperties: true, type: 'object' },
      },
    ])
    const lang = val('en')
    const inputs = new WorkbenchRunInputs(definitions, lang)

    try {
      expect(inputs.replaceValues({ payload: {} })).toBe(true)
      const handle = inputs.section.$.handles.value[0]
      if (handle == null || typeof handle === 'string') throw new Error('The payload handle is missing.')
      const widget = handle.widget$.value
      if (!(widget instanceof ObjectWidgetStore)) throw new Error('The payload editor is not an object widget.')

      widget.addField('untyped', -1)
      const field = widget.untypedFields$?.value[0]
      expect(field?.name).toBe('field')
      field?.value$?.set('hello')
      expect(inputs.values()).toEqual({ payload: { field: 'hello' } })

      widget.renameField('field', 'message')
      expect(inputs.values()).toEqual({ payload: { message: 'hello' } })
      widget.removeField('message')
      expect(inputs.values()).toEqual({ payload: {} })
    } finally {
      inputs.dispose()
      definitions.dispose()
      lang.dispose()
    }
  })

  it('derives trigger bindings and the downstream execution branch', () => {
    const targets = resolveWorkbenchTriggerRunTargets([
      { nodeId: nodeId('webhook'), nodeType: 'trigger', title: 'Webhook', trigger: trigger('Webhook') },
      { inputsFrom: [from('request', 'webhook')], nodeId: nodeId('parse'), nodeType: 'task' },
      { inputsFrom: [from('value', 'parse', 'result')], nodeId: nodeId('save'), nodeType: 'task' },
      { nodeId: nodeId('unrelated'), nodeType: 'task' },
      { ignore: true, inputsFrom: [from('value', 'parse', 'result')], nodeId: nodeId('ignored'), nodeType: 'task' },
    ])

    expect(targets).toEqual([
      {
        bindings: [{ inputHandle: 'request', nodeId: 'parse' }],
        nodeId: 'webhook',
        nodes: ['parse', 'save'],
        payloadSchema: trigger('Webhook').definition.payload_schema,
        title: 'Webhook',
      },
    ])
    expect(resolveWorkbenchTriggerInvocation(targets[0]!, { message: 'hello' })).toEqual({
      inputs: {
        parse: {
          request: { message: 'hello' },
        },
      },
      nodes: ['parse', 'save'],
    })
  })

  it('keeps each active trigger branch independent', () => {
    const targets = resolveWorkbenchTriggerRunTargets([
      { nodeId: nodeId('first'), nodeType: 'trigger', trigger: trigger('First') },
      { nodeId: nodeId('second'), nodeType: 'trigger', trigger: trigger('Second') },
      { inputsFrom: [from('payload', 'first')], nodeId: nodeId('first-task'), nodeType: 'task' },
      { inputsFrom: [from('payload', 'second')], nodeId: nodeId('second-task'), nodeType: 'task' },
    ])

    expect(targets.map(({ bindings, nodeId: id, nodes }) => ({ bindings, nodeId: id, nodes }))).toEqual([
      {
        bindings: [{ inputHandle: 'payload', nodeId: 'first-task' }],
        nodeId: 'first',
        nodes: ['first-task'],
      },
      {
        bindings: [{ inputHandle: 'payload', nodeId: 'second-task' }],
        nodeId: 'second',
        nodes: ['second-task'],
      },
    ])
  })

  it('reads Trigger bindings from a live FlowMeta', async () => {
    const root = '/workspace' as SearchPath
    const revision = 'revision' as Revision
    const flowPath = `${root}/flows/main/flow.oo.yaml` as FlowPath
    const taskPath = `${root}/tasks/json-text/task.oo.yaml` as BlockPath
    const { context, packageMeta } = createMemoryPackage({
      files: [
        memoryFile(
          flowPath,
          `trigger_definitions:
  - type: open-flow.webhook
    revision: '1'
    definition:
      service_id: open-flow
      service_name: Open Flow
      name: Webhook
      provisioning:
        kind: webhook
      config_schema:
        type: object
        additionalProperties: false
      payload_schema:
        type: object
        additionalProperties: true
nodes:
  - node_id: updates-webhook
    trigger:
      type: open-flow.webhook
      revision: '1'
      config: {}
  - node_id: stringify-update
    task: self::json-text
    inputs_from:
      - handle: value
        from_node:
          - node_id: updates-webhook
            output_handle: payload
`,
          revision,
        ),
        memoryFile(
          taskPath,
          `inputs_def:
  - handle: value
outputs_def:
  - handle: text
executor:
  name: javascript
  options:
    entry: main.ts
`,
          revision,
        ),
      ],
      packageRevision: revision,
      packageSource: 'name: test\n',
      root,
    })

    try {
      await packageMeta.sharedBlocks.refreshAll()
      const flowMeta = await packageMeta.flows.refreshFlow(flowPath, true)
      expect(flowMeta).toBeDefined()
      const lang = val('en')
      const inputs = new WorkbenchTriggerRunInputs(flowMeta!, lang)
      try {
        expect(inputs.targets$.value).toEqual([
          expect.objectContaining({
            bindings: [{ inputHandle: 'value', nodeId: 'stringify-update' }],
            nodeId: 'updates-webhook',
            nodes: ['stringify-update'],
          }),
        ])
        expect(inputs.resolveInvocation({ payload: { updateId: 'update-1' } }, undefined)).toEqual({
          inputs: {
            'stringify-update': {
              value: { updateId: 'update-1' },
            },
          },
          nodes: ['stringify-update'],
        })
      } finally {
        inputs.dispose()
        lang.dispose()
      }
    } finally {
      packageMeta.dispose()
      context.dispose()
    }
  })
})
