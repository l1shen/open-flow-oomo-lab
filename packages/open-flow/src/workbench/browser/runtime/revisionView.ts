import type {
  CodeModule,
  ConditionNode,
  Draft,
  Graph,
  GraphNode,
  GraphTarget,
  ProjectDocument,
  SubflowNode,
  TaskDefinition,
  TaskNode,
  TriggerNode,
  ValueNode,
} from './api.ts'

type FlowDefinition = ProjectDocument['flows'][string]
type SubflowDefinition = ProjectDocument['subflows'][string]

export type ResolvedNode =
  | { readonly id: string; readonly kind: 'condition'; readonly node: ConditionNode }
  | { readonly id: string; readonly kind: 'subflow'; readonly node: SubflowNode; readonly definition?: SubflowDefinition }
  | {
      readonly definition?: TaskDefinition
      readonly id: string
      readonly kind: 'task'
      readonly module?: CodeModule
      readonly node: TaskNode
    }
  | { readonly id: string; readonly kind: 'value'; readonly node: ValueNode }

export interface ResolvedTrigger {
  readonly id: string
  readonly kind: 'trigger'
  readonly node: TriggerNode
  readonly trigger: TriggerNode
}

export type ResolvedSelection = ResolvedNode | ResolvedTrigger

interface TaskNodeReference {
  readonly nodeId: string
  readonly taskId: string
}

const views = new WeakMap<Draft, RevisionView>()

export class RevisionView {
  public readonly connectorActionIds: ReadonlySet<string>
  public readonly flowIds: readonly string[]
  readonly #document: ProjectDocument
  readonly #flowIdsBySubflow = new Map<string, readonly string[]>()
  readonly #modules: Draft['content']['modules']
  readonly #resolvedNodes = new WeakMap<GraphNode, Map<string, ResolvedSelection>>()
  readonly #taskNodesByGraph = new WeakMap<Graph, readonly TaskNodeReference[]>()

  public constructor(public readonly revision: Draft) {
    this.#document = revision.content.document
    this.#modules = revision.content.modules
    this.flowIds = Object.keys(this.#document.flows)
    const connectorActionIds = new Set<string>()
    for (const task of Object.values(this.#document.tasks)) if (task.executor.kind == 'connector') connectorActionIds.add(task.executor.action)
    this.connectorActionIds = connectorActionIds
  }

  public flow(flowId: string): FlowDefinition | undefined {
    return this.#document.flows[flowId]
  }

  public subflow(subflowId: string): SubflowDefinition | undefined {
    return this.#document.subflows[subflowId]
  }

  public graph(target: GraphTarget): Graph | undefined {
    switch (target.kind) {
      case 'flow':
        return this.#document.flows[target.id]?.graph
      case 'subflow':
        return this.#document.subflows[target.id]?.graph
    }
  }

  public designerInputs(target: GraphTarget): readonly unknown[] {
    const resource = target.kind == 'flow' ? this.#document.flows[target.id] : this.#document.subflows[target.id]
    if (resource == null) return []
    const inputs: unknown[] = [resource]
    for (const [nodeId, node] of Object.entries(resource.graph.nodes)) {
      const resolved = this.resolveNode(nodeId, node)
      if (resolved.kind == 'task' || resolved.kind == 'subflow') inputs.push(resolved.definition)
    }
    return inputs
  }

  public node(target: GraphTarget, nodeId: string): ResolvedSelection | undefined {
    const node = this.graph(target)?.nodes[nodeId]
    return node == null ? undefined : this.resolveNode(nodeId, node)
  }

  public selection(target: GraphTarget, nodeId: string): ResolvedSelection | undefined {
    return this.node(target, nodeId)
  }

  public resolveNode(nodeId: string, node: GraphNode): ResolvedSelection {
    let resolvedById = this.#resolvedNodes.get(node)
    const cached = resolvedById?.get(nodeId)
    if (cached != null) return cached
    resolvedById ??= new Map()
    let resolved: ResolvedSelection
    switch (node.kind) {
      case 'condition':
        resolved = { id: nodeId, kind: node.kind, node }
        break
      case 'subflow':
        resolved = { definition: this.#document.subflows[node.subflowId], id: nodeId, kind: node.kind, node }
        break
      case 'task': {
        const definition = node.task != null ? node.task : this.#document.tasks[node.taskId]
        const module = definition != null && 'moduleId' in definition ? this.#modules[definition.moduleId] : undefined
        resolved = { definition, id: nodeId, kind: node.kind, module, node }
        break
      }
      case 'value':
        resolved = { id: nodeId, kind: node.kind, node }
        break
      case 'cron':
      case 'integration':
      case 'poll':
      case 'webhook':
        resolved = { id: nodeId, kind: 'trigger', node, trigger: node }
        break
    }
    resolvedById.set(nodeId, resolved)
    this.#resolvedNodes.set(node, resolvedById)
    return resolved
  }

  public findTaskNode(target: GraphTarget, taskIds: ReadonlySet<string>): string | undefined {
    const graph = this.graph(target)
    if (graph == null) return
    return this.#taskNodes(graph).find(({ taskId }) => taskIds.has(taskId))?.nodeId
  }

  public findModuleNode(target: GraphTarget, moduleId: string): string | undefined {
    return Object.entries(this.graph(target)?.nodes ?? {}).find(([, node]) => node.kind == 'task' && node.task?.moduleId == moduleId)?.[0]
  }

  public task(taskId: string): ProjectDocument['tasks'][string] | undefined {
    return this.#document.tasks[taskId]
  }

  public binding(bindingId: string): ProjectDocument['bindings'][string] | undefined {
    return this.#document.bindings[bindingId]
  }

  public trigger(flowId: string, triggerId: string): TriggerNode | undefined {
    const node = this.#document.flows[flowId]?.graph.nodes[triggerId]
    return node != null && !('inputs' in node) ? node : undefined
  }

  public flowIdsUsingSubflow(subflowId: string): readonly string[] {
    const cached = this.#flowIdsBySubflow.get(subflowId)
    if (cached != null) return cached
    const flowIds = Object.entries(this.#document.flows).flatMap(([flowId, flow]) => (this.#graphUsesSubflow(flow.graph, subflowId, new Set()) ? [flowId] : []))
    this.#flowIdsBySubflow.set(subflowId, flowIds)
    return flowIds
  }

  #taskNodes(graph: Graph): readonly TaskNodeReference[] {
    let taskNodes = this.#taskNodesByGraph.get(graph)
    if (taskNodes != null) return taskNodes
    taskNodes = Object.entries(graph.nodes).flatMap(([nodeId, node]) => (node.kind == 'task' && node.task == null ? [{ nodeId, taskId: node.taskId }] : []))
    this.#taskNodesByGraph.set(graph, taskNodes)
    return taskNodes
  }

  #graphUsesSubflow(graph: Graph, subflowId: string, visited: Set<string>): boolean {
    for (const node of Object.values(graph.nodes)) {
      if (node.kind != 'subflow') continue
      if (node.subflowId == subflowId) return true
      if (visited.has(node.subflowId)) continue
      visited.add(node.subflowId)
      const nested = this.#document.subflows[node.subflowId]
      if (nested != null && this.#graphUsesSubflow(nested.graph, subflowId, visited)) return true
    }
    return false
  }
}

export function revisionView(revision: Draft): RevisionView {
  let view = views.get(revision)
  if (view == null) {
    view = new RevisionView(revision)
    views.set(revision, view)
  }
  return view
}
