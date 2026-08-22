export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export const resourceNameMaxLength = 80

export type ResourceNameIssue = 'controlCharacter' | 'empty' | 'specialCharacter' | 'tooLong'

export function resourceNameIssue(value: string): ResourceNameIssue | undefined {
  const name = value.trim()
  if (name.length == 0) return 'empty'
  if (name.length > resourceNameMaxLength) return 'tooLong'
  for (const character of name) {
    const code = character.charCodeAt(0)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return 'controlCharacter'
  }
  if (!/^[\p{L}\p{N}](?:[\p{L}\p{N} _-]*[\p{L}\p{N}])?$/u.test(name)) return 'specialCharacter'
}

export interface PortDefinition {
  readonly description?: string
  readonly jsonSchema: JsonValue
  readonly nullable: boolean
}

export interface InputPortDefinition extends PortDefinition {
  readonly value?: JsonValue
}

export interface NodeSource {
  readonly kind: 'node'
  readonly nodeId: string
  readonly output: string
}

export interface FlowSource {
  readonly input: string
  readonly kind: 'flow'
}

export interface BindingSource {
  readonly bindingId: string
  readonly kind: 'binding'
}

export type InputMapping =
  | { readonly kind: 'sources'; readonly sources: readonly (BindingSource | FlowSource | NodeSource)[] }
  | { readonly kind: 'value'; readonly value: JsonValue }

export interface OutputMapping {
  readonly sources: readonly (FlowSource | NodeSource)[]
}

interface GraphNodeBase {
  readonly concurrency: number
  readonly description?: string
  readonly inputs: Readonly<Record<string, InputMapping>>
  readonly name?: string
  readonly timeoutMs?: number
}

export interface SubflowNode extends GraphNodeBase {
  readonly kind: 'subflow'
  readonly subflowId: string
}

export interface ValueNode extends GraphNodeBase {
  readonly kind: 'value'
  readonly values: Readonly<Record<string, InputPortDefinition>>
}

export type ConditionOperator =
  | '!='
  | '<'
  | '<='
  | '=='
  | '>'
  | '>='
  | 'contains'
  | 'endsWith'
  | 'hasKey'
  | 'hasValue'
  | 'isEmpty'
  | 'isFalse'
  | 'isNotEmpty'
  | 'isNotNull'
  | 'isNull'
  | 'isTrue'
  | 'notContains'
  | 'notHasKey'
  | 'notHasValue'
  | 'startsWith'

export interface ConditionExpression {
  readonly input: string
  readonly operator: ConditionOperator
  readonly value?: JsonValue
}

export interface ConditionCase {
  readonly expressions: readonly ConditionExpression[]
  readonly output: string
  readonly relation: 'all' | 'any'
}

export interface ConditionNode extends GraphNodeBase {
  readonly cases: readonly ConditionCase[]
  readonly defaultOutput?: string
  readonly input: InputPortDefinition & { readonly handle: string }
  readonly kind: 'condition'
}

export type ManagedTaskExecutor =
  | { readonly kind: 'connector'; readonly action: string; readonly connectionId?: string }
  | { readonly kind: 'llm'; readonly mode: 'chat' | 'json' }

export interface ConnectorCapability {
  readonly action: string
  readonly connectionId: string
  readonly kind: 'connector'
}

interface TaskDefinitionBase {
  readonly inputs: Readonly<Record<string, InputPortDefinition>>
  readonly name: string
  readonly outputs: Readonly<Record<string, PortDefinition>>
}

export interface InlineTaskDefinition extends TaskDefinitionBase {
  readonly capabilities?: readonly ConnectorCapability[]
  readonly moduleId: string
}

export interface ManagedTaskDefinition extends TaskDefinitionBase {
  readonly executor: ManagedTaskExecutor
}

export type TaskDefinition = InlineTaskDefinition | ManagedTaskDefinition

export type TaskNode = GraphNodeBase & { readonly kind: 'task' } & (
    | { readonly task: InlineTaskDefinition; readonly taskId?: never }
    | { readonly task?: never; readonly taskId: string }
  )

export interface Graph {
  readonly nodes: Readonly<Record<string, GraphNode>>
}

export type TriggerSchedule =
  | { readonly expression: string; readonly timezone: string; readonly type: 'cron' }
  | { readonly type: 'every'; readonly unit: 'day' | 'hour' | 'minute' | 'month' | 'week'; readonly value: number }

interface TriggerKeySnapshotBase {
  readonly configSchema: JsonValue
  readonly definitionVersion: number
  readonly description: string
  readonly displayName: string
  readonly key: string
  readonly name: string
  readonly payloadSchema: JsonValue
  readonly provider: string
}

export type IntegrationEndpointMethod = 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT'

export type IntegrationBodyFormat = 'form' | 'json' | 'multipart' | 'text'

export interface IntegrationEndpointDeclaration {
  readonly body: {
    readonly allowArray: boolean
    readonly allowEmpty: boolean
    readonly formats: readonly IntegrationBodyFormat[]
  }
  readonly methods: readonly IntegrationEndpointMethod[]
  readonly successStatus: number
}

export type TriggerKeySnapshot =
  | (TriggerKeySnapshotBase & { readonly type: 'poll' })
  | (TriggerKeySnapshotBase & { readonly endpoint: IntegrationEndpointDeclaration; readonly type: 'integration' })

export interface WebhookInputDefinition extends InputPortDefinition {
  readonly handle: string
}

export interface WebhookOptions {
  readonly allowedMethods?: readonly string[]
  readonly allowedOrigins?: readonly string[]
  readonly noResponseBody?: boolean
  readonly responseData?: string
  readonly responseHeaders?: Readonly<Record<string, string>>
  readonly responseStatusCode?: number
}

interface TriggerNodeBase {
  readonly description?: string
  readonly name: string
}

export type TriggerNode =
  | (TriggerNodeBase & {
      readonly inputsDef: readonly WebhookInputDefinition[]
      readonly kind: 'webhook'
      readonly options?: WebhookOptions
    })
  | (TriggerNodeBase & { readonly cronTimes: readonly TriggerSchedule[]; readonly kind: 'cron' })
  | (TriggerNodeBase & {
      readonly bindingId: string
      readonly config: Readonly<Record<string, JsonValue>>
      readonly definition: TriggerKeySnapshot & { readonly type: 'poll' }
      readonly kind: 'poll'
      readonly pollTimes: readonly TriggerSchedule[]
    })
  | (TriggerNodeBase & {
      readonly bindingId: string
      readonly config: Readonly<Record<string, JsonValue>>
      readonly definition: TriggerKeySnapshot & { readonly type: 'integration' }
      readonly kind: 'integration'
    })

export type GraphNode = ConditionNode | SubflowNode | TaskNode | TriggerNode | ValueNode

export interface ProjectDocument {
  readonly bindings: Readonly<Record<string, { readonly kind: 'connection' | 'secret'; readonly target: string }>>
  readonly flows: Readonly<Record<string, { readonly graph: Graph; readonly name: string }>>
  readonly subflows: Readonly<
    Record<
      string,
      {
        readonly graph: Graph
        readonly inputs: Readonly<Record<string, InputPortDefinition>>
        readonly name: string
        readonly outputs: Readonly<Record<string, OutputMapping & PortDefinition>>
      }
    >
  >
  readonly tasks: Readonly<Record<string, ManagedTaskDefinition>>
}

export interface CodeModule {
  readonly imports: readonly string[]
  readonly name: string
  readonly source: string
}

export interface RevisionContent {
  readonly document: ProjectDocument
  readonly modelVersion: 1
  readonly modules: Readonly<Record<string, CodeModule>>
}

export type GraphTarget = { readonly id: string; readonly kind: 'flow' } | { readonly id: string; readonly kind: 'subflow' }

export interface GraphEdge {
  readonly source: string
  readonly sourceHandle: string
  readonly target: string
  readonly targetHandle: string
}

export type ChangeOperation =
  | { readonly binding: ProjectDocument['bindings'][string]; readonly bindingId: string; readonly kind: 'binding.create' }
  | { readonly binding: ProjectDocument['bindings'][string]; readonly bindingId: string; readonly kind: 'binding.replace' }
  | { readonly bindingId: string; readonly kind: 'binding.delete' }
  | { readonly flow: ProjectDocument['flows'][string]; readonly flowId: string; readonly kind: 'flow.create' }
  | { readonly flowId: string; readonly kind: 'flow.delete' }
  | { readonly flowId: string; readonly kind: 'flow.rename'; readonly name: string }
  | { readonly kind: 'graph.edge.connect'; readonly edge: GraphEdge; readonly target: GraphTarget }
  | { readonly kind: 'graph.edge.disconnect'; readonly edge: GraphEdge; readonly target: GraphTarget }
  | { readonly kind: 'graph.node.create'; readonly node: GraphNode; readonly nodeId: string; readonly target: GraphTarget }
  | { readonly kind: 'graph.node.delete'; readonly nodeId: string; readonly target: GraphTarget }
  | { readonly kind: 'graph.node.replace'; readonly node: GraphNode; readonly nodeId: string; readonly target: GraphTarget }
  | { readonly kind: 'module.create'; readonly module: CodeModule; readonly moduleId: string }
  | { readonly kind: 'module.delete'; readonly moduleId: string }
  | { readonly kind: 'module.rename'; readonly moduleId: string; readonly name: string }
  | { readonly imports: readonly string[]; readonly kind: 'module.source.replace'; readonly moduleId: string; readonly source: string }
  | { readonly kind: 'subflow.create'; readonly subflow: ProjectDocument['subflows'][string]; readonly subflowId: string }
  | {
      readonly definition: Omit<ProjectDocument['subflows'][string], 'graph'>
      readonly kind: 'subflow.definition.replace'
      readonly subflowId: string
    }
  | { readonly kind: 'subflow.delete'; readonly subflowId: string }
  | { readonly kind: 'task.create'; readonly task: ProjectDocument['tasks'][string]; readonly taskId: string }
  | { readonly kind: 'task.delete'; readonly taskId: string }
  | { readonly kind: 'task.replace'; readonly task: ProjectDocument['tasks'][string]; readonly taskId: string }

export class ProjectChangeError extends Error {}

function invalid(): never {
  throw new ProjectChangeError()
}

function selectedGraph(document: ProjectDocument, target: GraphTarget): Graph {
  const resource = target.kind == 'flow' ? document.flows[target.id] : document.subflows[target.id]
  if (resource == null) invalid()
  return resource.graph
}

function replaceGraph(document: ProjectDocument, target: GraphTarget, value: Graph): ProjectDocument {
  if (target.kind == 'flow') {
    const flow = document.flows[target.id]
    if (flow == null) invalid()
    return { ...document, flows: { ...document.flows, [target.id]: { ...flow, graph: value } } }
  }
  const subflow = document.subflows[target.id]
  if (subflow == null) invalid()
  return { ...document, subflows: { ...document.subflows, [target.id]: { ...subflow, graph: value } } }
}

function withoutNodeSources(node: GraphNode, removed: ReadonlySet<string>): GraphNode {
  if (!('inputs' in node)) return node
  const inputs = { ...node.inputs }
  for (const [handle, mapping] of Object.entries(inputs)) {
    if (mapping.kind != 'sources') continue
    const remaining = mapping.sources.filter((source) => source.kind != 'node' || !removed.has(source.nodeId))
    if (remaining.length == 0) delete inputs[handle]
    else inputs[handle] = { kind: 'sources', sources: remaining }
  }
  return { ...node, inputs }
}

export function applyProjectChanges(content: RevisionContent, operations: readonly ChangeOperation[]): RevisionContent {
  const document = { ...content.document }
  const modules = { ...content.modules }
  for (const operation of operations) {
    switch (operation.kind) {
      case 'binding.create':
        if (document.bindings[operation.bindingId] != null) invalid()
        document.bindings = { ...document.bindings, [operation.bindingId]: operation.binding }
        break
      case 'binding.replace':
        if (document.bindings[operation.bindingId] == null) invalid()
        document.bindings = { ...document.bindings, [operation.bindingId]: operation.binding }
        break
      case 'binding.delete': {
        if (document.bindings[operation.bindingId] == null) invalid()
        const bindings = { ...document.bindings }
        delete bindings[operation.bindingId]
        document.bindings = bindings
        break
      }
      case 'flow.create':
        if (document.flows[operation.flowId] != null) invalid()
        document.flows = { ...document.flows, [operation.flowId]: operation.flow }
        break
      case 'flow.delete': {
        if (document.flows[operation.flowId] == null) invalid()
        const flows = { ...document.flows }
        delete flows[operation.flowId]
        document.flows = flows
        break
      }
      case 'flow.rename': {
        const flow = document.flows[operation.flowId]
        if (flow == null) invalid()
        document.flows = { ...document.flows, [operation.flowId]: { ...flow, name: operation.name } }
        break
      }
      case 'graph.edge.connect': {
        const graph = selectedGraph(document, operation.target)
        if (graph.nodes[operation.edge.source] == null) invalid()
        const node = graph.nodes[operation.edge.target]
        if (node == null || !('inputs' in node)) invalid()
        const mapping = node.inputs[operation.edge.targetHandle]
        const source: NodeSource = { kind: 'node', nodeId: operation.edge.source, output: operation.edge.sourceHandle }
        const sources = mapping?.kind == 'sources' ? mapping.sources : []
        if (sources.some((candidate) => candidate.kind == 'node' && candidate.nodeId == source.nodeId && candidate.output == source.output)) invalid()
        const updated = { ...node, inputs: { ...node.inputs, [operation.edge.targetHandle]: { kind: 'sources' as const, sources: [...sources, source] } } }
        Object.assign(document, replaceGraph(document, operation.target, { nodes: { ...graph.nodes, [operation.edge.target]: updated } }))
        break
      }
      case 'graph.edge.disconnect': {
        const graph = selectedGraph(document, operation.target)
        const node = graph.nodes[operation.edge.target]
        if (node == null || !('inputs' in node)) invalid()
        const mapping = node.inputs[operation.edge.targetHandle]
        if (mapping?.kind != 'sources') invalid()
        const sources = mapping.sources.filter(
          (source) => source.kind != 'node' || source.nodeId != operation.edge.source || source.output != operation.edge.sourceHandle,
        )
        if (sources.length == mapping.sources.length) invalid()
        const inputs = { ...node.inputs }
        if (sources.length == 0) delete inputs[operation.edge.targetHandle]
        else inputs[operation.edge.targetHandle] = { kind: 'sources', sources }
        Object.assign(document, replaceGraph(document, operation.target, { nodes: { ...graph.nodes, [operation.edge.target]: { ...node, inputs } } }))
        break
      }
      case 'graph.node.create': {
        const graph = selectedGraph(document, operation.target)
        if (graph.nodes[operation.nodeId] != null || (operation.target.kind == 'subflow' && !('inputs' in operation.node))) invalid()
        Object.assign(document, replaceGraph(document, operation.target, { nodes: { ...graph.nodes, [operation.nodeId]: operation.node } }))
        break
      }
      case 'graph.node.delete': {
        const graph = selectedGraph(document, operation.target)
        if (graph.nodes[operation.nodeId] == null) invalid()
        const removed = new Set([operation.nodeId])
        const nodes = Object.fromEntries(
          Object.entries(graph.nodes).flatMap(([nodeId, node]) => (removed.has(nodeId) ? [] : [[nodeId, withoutNodeSources(node, removed)]])),
        )
        Object.assign(document, replaceGraph(document, operation.target, { nodes }))
        if (operation.target.kind == 'subflow') {
          const subflow = document.subflows[operation.target.id]!
          const outputs = Object.fromEntries(
            Object.entries(subflow.outputs).map(([handle, output]) => [
              handle,
              { ...output, sources: output.sources.filter((source) => source.kind != 'node' || !removed.has(source.nodeId)) },
            ]),
          )
          document.subflows = { ...document.subflows, [operation.target.id]: { ...subflow, outputs } }
        }
        break
      }
      case 'graph.node.replace': {
        const graph = selectedGraph(document, operation.target)
        if (graph.nodes[operation.nodeId] == null || (operation.target.kind == 'subflow' && !('inputs' in operation.node))) invalid()
        Object.assign(document, replaceGraph(document, operation.target, { nodes: { ...graph.nodes, [operation.nodeId]: operation.node } }))
        break
      }
      case 'module.create':
        if (modules[operation.moduleId] != null) invalid()
        modules[operation.moduleId] = operation.module
        break
      case 'module.delete':
        if (modules[operation.moduleId] == null) invalid()
        delete modules[operation.moduleId]
        break
      case 'module.rename': {
        const module = modules[operation.moduleId]
        if (module == null) invalid()
        modules[operation.moduleId] = { ...module, name: operation.name }
        break
      }
      case 'module.source.replace': {
        const module = modules[operation.moduleId]
        if (module == null) invalid()
        modules[operation.moduleId] = { ...module, imports: operation.imports, source: operation.source }
        break
      }
      case 'subflow.create':
        if (document.subflows[operation.subflowId] != null) invalid()
        document.subflows = { ...document.subflows, [operation.subflowId]: operation.subflow }
        break
      case 'subflow.definition.replace': {
        const subflow = document.subflows[operation.subflowId]
        if (subflow == null) invalid()
        document.subflows = { ...document.subflows, [operation.subflowId]: { ...operation.definition, graph: subflow.graph } }
        break
      }
      case 'subflow.delete': {
        if (document.subflows[operation.subflowId] == null) invalid()
        const subflows = { ...document.subflows }
        delete subflows[operation.subflowId]
        document.subflows = subflows
        break
      }
      case 'task.create':
        if (document.tasks[operation.taskId] != null) invalid()
        document.tasks = { ...document.tasks, [operation.taskId]: operation.task }
        break
      case 'task.delete': {
        if (document.tasks[operation.taskId] == null) invalid()
        const tasks = { ...document.tasks }
        delete tasks[operation.taskId]
        document.tasks = tasks
        break
      }
      case 'task.replace':
        if (document.tasks[operation.taskId] == null) invalid()
        document.tasks = { ...document.tasks, [operation.taskId]: operation.task }
        break
    }
  }
  return { document, modelVersion: content.modelVersion, modules }
}
