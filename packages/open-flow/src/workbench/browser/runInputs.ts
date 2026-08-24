import type { ReadonlyVal, Val } from 'value-enhancer'
import type { NodeShowSettings } from '../../designer/browser/stores/node/node.store.ts'
import type { FlowMeta } from '../../manifest/common/meta/flowMeta.ts'
import type { GroupDividerDef, HandleInputFrom, HandleName, InputHandleDef, JsonObject, NodeId } from '../../schema/index.ts'
import type { TriggerCatalogDescriptor } from '../../trigger/common/catalog.ts'

import { toPlainObject } from '@wopjs/cast'
import { compute, val } from 'value-enhancer'
import { InputSectionStore } from '../../designer/browser/stores/node/nodeSection/inputSection.store.ts'
import { isTriggerNodeManifest } from '../../manifest/common/model/node/triggerNodeManifest.ts'

export interface WorkbenchRunInvocation {
  readonly inputs: Readonly<Record<string, unknown>>
  readonly nodes: readonly string[] | undefined
}

export class WorkbenchRunInputs {
  public readonly section: InputSectionStore

  readonly #inputValues = val<readonly HandleInputFrom[] | undefined>(undefined)
  public readonly inputValues$: ReadonlyVal<readonly HandleInputFrom[] | undefined> = this.#inputValues

  public constructor(inputDefinitions: ReadonlyVal<(InputHandleDef | GroupDividerDef)[] | undefined>, lang: ReadonlyVal<string>) {
    const showSettings = val<NodeShowSettings | undefined>(undefined)
    this.section = new InputSectionStore({
      createSchemaEditor: () => undefined,
      handleInputsFrom: this.#inputValues,
      inputHandleDefs: inputDefinitions,
      lang,
      role: 'user',
      showSettings,
    })
    this.section.dispose.add(showSettings)
  }

  public get hasInputs(): boolean {
    return !this.section.$.isEmpty.value
  }

  public shouldRequest(_nodes: readonly string[] | undefined): boolean {
    return this.hasInputs
  }

  public resolveInvocation(inputs: Readonly<Record<string, unknown>>, nodes: readonly string[] | undefined): WorkbenchRunInvocation {
    return { inputs, nodes }
  }

  public dispose(): void {
    this.section.dispose()
    this.#inputValues.dispose()
  }

  public values(): Readonly<Record<string, unknown>> {
    const names = new Set(this.section.$.allHandleNames.value)
    const result: Record<string, unknown> = {}
    for (const input of this.#inputValues.value ?? []) {
      if (names.has(input.handle) && input.value !== undefined) result[input.handle] = input.value
    }
    return result
  }

  public replaceValues(value: unknown): boolean {
    const object = toPlainObject(value)
    if (object == null) return false
    const names = new Set(this.section.$.allHandleNames.value)
    const inputs: HandleInputFrom[] = []
    for (const [handle, input] of Object.entries(object)) {
      if (!names.has(handle as HandleName)) return false
      if (input !== undefined) inputs.push({ handle: handle as HandleName, value: input })
    }
    this.#inputValues.set(inputs.length == 0 ? undefined : inputs)
    return true
  }
}

export interface WorkbenchTriggerRunNode {
  readonly ignore?: boolean
  readonly inputsFrom?: readonly HandleInputFrom[]
  readonly nodeId: NodeId
  readonly nodeType: 'condition' | 'subflow' | 'task' | 'trigger' | 'value'
  readonly title?: string
  readonly trigger?: TriggerCatalogDescriptor
}

export interface WorkbenchTriggerBinding {
  readonly inputHandle: HandleName
  readonly nodeId: NodeId
}

export interface WorkbenchTriggerRunTarget {
  readonly bindings: readonly WorkbenchTriggerBinding[]
  readonly nodeId: NodeId
  readonly nodes: readonly NodeId[]
  readonly payloadSchema: JsonObject
  readonly title: string
}

export function resolveWorkbenchTriggerInvocation(target: WorkbenchTriggerRunTarget, payload: unknown): WorkbenchRunInvocation {
  const inputs: Record<string, Record<string, unknown>> = {}
  for (const binding of target.bindings) {
    const values = inputs[binding.nodeId] ?? {}
    values[binding.inputHandle] = payload
    inputs[binding.nodeId] = values
  }
  return { inputs, nodes: target.nodes }
}

function isExecutableNode(node: WorkbenchTriggerRunNode): boolean {
  return !node.ignore && (node.nodeType == 'condition' || node.nodeType == 'subflow' || node.nodeType == 'task')
}

export function resolveWorkbenchTriggerRunTargets(nodes: readonly WorkbenchTriggerRunNode[]): readonly WorkbenchTriggerRunTarget[] {
  const executableNodes = nodes.filter(isExecutableNode)
  const executableNodeIds = new Set(executableNodes.map((node) => node.nodeId))
  const forward = new Map<NodeId, Set<NodeId>>()

  for (const node of executableNodes) {
    for (const input of node.inputsFrom ?? []) {
      for (const source of input.from_node ?? []) {
        if (!executableNodeIds.has(source.node_id)) continue
        const targets = forward.get(source.node_id) ?? new Set<NodeId>()
        targets.add(node.nodeId)
        forward.set(source.node_id, targets)
      }
    }
  }

  return nodes.flatMap((triggerNode): WorkbenchTriggerRunTarget[] => {
    if (triggerNode.nodeType != 'trigger' || triggerNode.ignore || triggerNode.trigger == null) return []
    const bindings: WorkbenchTriggerBinding[] = []
    for (const node of executableNodes) {
      for (const input of node.inputsFrom ?? []) {
        for (const source of input.from_node ?? []) {
          if (source.node_id == triggerNode.nodeId && source.output_handle == 'payload') {
            bindings.push({ inputHandle: input.handle, nodeId: node.nodeId })
          }
        }
      }
    }

    const selected = new Set(bindings.map((binding) => binding.nodeId))
    const pending = [...selected]
    while (pending.length > 0) {
      for (const target of forward.get(pending.pop()!) ?? []) {
        if (selected.has(target)) continue
        selected.add(target)
        pending.push(target)
      }
    }

    return [
      {
        bindings,
        nodeId: triggerNode.nodeId,
        nodes: executableNodes.flatMap((node) => (selected.has(node.nodeId) ? [node.nodeId] : [])),
        payloadSchema: triggerNode.trigger.definition.payload_schema,
        title: triggerNode.title || triggerNode.trigger.definition.name || triggerNode.nodeId,
      },
    ]
  })
}

interface WorkbenchTriggerRunInputsState {
  readonly definitions$: ReadonlyVal<InputHandleDef[] | undefined>
  readonly selectedTriggerId$: Val<NodeId | undefined>
  readonly stopSelection: () => void
  readonly targets$: ReadonlyVal<readonly WorkbenchTriggerRunTarget[]>
}

function createTriggerRunInputsState(flowMeta: FlowMeta): WorkbenchTriggerRunInputsState {
  const targets$ = compute((get) =>
    resolveWorkbenchTriggerRunTargets(
      [...get(flowMeta.nodes).values()].map((node) => {
        const trigger = isTriggerNodeManifest(node.manifest) ? get(node.manifest.$.trigger) : undefined
        const definition = isTriggerNodeManifest(node.manifest) ? get(node.$.triggerDefinition) : undefined
        return {
          ignore: get(node.manifest.$.ignore),
          inputsFrom: get(node.manifest.$.inputs_from),
          nodeId: node.nodeId,
          nodeType: node.manifest.nodeType,
          title: get(node.$.title),
          trigger: trigger == null || definition == null ? undefined : { ...trigger, definition },
        }
      }),
    ),
  )
  const selectedTriggerId$ = val<NodeId | undefined>(targets$.value[0]?.nodeId)
  const stopSelection = targets$.reaction((targets) => {
    if (!targets.some((target) => target.nodeId == selectedTriggerId$.value)) selectedTriggerId$.set(targets[0]?.nodeId)
  })
  const definitions$ = compute((get): InputHandleDef[] | undefined => {
    const selected = get(targets$).find((target) => target.nodeId == get(selectedTriggerId$))
    if (selected == null) return
    return [{ handle: 'payload' as HandleName, json_schema: selected.payloadSchema }]
  })
  return { definitions$, selectedTriggerId$, stopSelection, targets$ }
}

export class WorkbenchTriggerRunInputs extends WorkbenchRunInputs {
  public readonly selectedTriggerId$: Val<NodeId | undefined>
  public readonly targets$: ReadonlyVal<readonly WorkbenchTriggerRunTarget[]>

  readonly #definitions$: ReadonlyVal<InputHandleDef[] | undefined>
  readonly #stopSelection: () => void

  public constructor(flowMeta: FlowMeta, lang: ReadonlyVal<string>, state = createTriggerRunInputsState(flowMeta)) {
    super(state.definitions$, lang)
    this.#definitions$ = state.definitions$
    this.selectedTriggerId$ = state.selectedTriggerId$
    this.targets$ = state.targets$
    this.#stopSelection = state.stopSelection
    this.replaceValues({ payload: {} })
  }

  public override get hasInputs(): boolean {
    return this.targets$.value.length > 0
  }

  public override shouldRequest(nodes: readonly string[] | undefined): boolean {
    return nodes == null && this.hasInputs
  }

  public selectTrigger(nodeId: NodeId): void {
    this.selectedTriggerId$.set(nodeId)
    this.replaceValues({ payload: {} })
  }

  public override resolveInvocation(inputs: Readonly<Record<string, unknown>>, nodes: readonly string[] | undefined): WorkbenchRunInvocation {
    if (nodes != null) return { inputs, nodes }
    const target = this.targets$.value.find((candidate) => candidate.nodeId == this.selectedTriggerId$.value)
    if (target == null) return { inputs: {}, nodes }
    return resolveWorkbenchTriggerInvocation(target, inputs.payload)
  }

  public override dispose(): void {
    super.dispose()
    this.#stopSelection()
    this.#definitions$.dispose()
    this.selectedTriggerId$.dispose()
    this.targets$.dispose()
  }
}
