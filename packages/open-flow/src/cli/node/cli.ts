import type {
  ConnectorAction,
  ConnectorConnection,
  Flow,
  JsonValue,
  Project,
  Publication,
  RunDetails,
  RunEvent,
  RunEvents,
  RunStatus,
  TriggerKeySnapshot,
  TriggerKeySummary,
} from '../../control/common/api.ts'
import type { CodeModule, GraphNode, InputPortDefinition, PortDefinition, RevisionContent, TriggerNode, TriggerSchedule } from '../../project/common/change.ts'

import { ApiError, ControlClient } from '../../control/common/api.ts'
import { runStatuses as runStatusValues } from '../../execution/common/runLifecycle.ts'
import { applyProjectChanges, resourceNameIssue, resourceNameMaxLength } from '../../project/common/change.ts'
import { connect as connectEdge, disconnect as disconnectEdge } from '../../project/common/edgeChanges.ts'
import { createFlow, deleteFlow, renameFlow } from '../../project/common/flowChanges.ts'
import { imports as moduleImports, rename as renameModule, replaceSource } from '../../project/common/moduleChanges.ts'
import {
  createCodeTask,
  createBuiltinTrigger,
  createCondition,
  createLlmTask,
  createManagedTask,
  createProviderTrigger,
  createValue,
  deleteNodes,
  setConnectorConnection,
  setTriggerConnection,
  setInputValues,
  updateSettings,
  updateTrigger,
} from '../../project/common/nodeChanges.ts'

export interface CommandHost {
  readonly request: (path: string, init?: RequestInit) => Promise<Response>
  getWorkbenchUrl?(projectId: string, flowId?: string): Promise<string>
  getProject(): Promise<string | undefined>
  setProject(projectId: string): Promise<void>
}

interface Runtime {
  readonly env: Readonly<Record<string, string | undefined>>
  readonly interactive: boolean
  readonly language: 'en' | 'zh-CN'
  openUrl(url: string): Promise<void>
  question(prompt: string): Promise<string>
  readFile(path: string): Promise<string>
  readStdin(): Promise<string>
  readonly stderr: { write(value: string): unknown }
  readonly stdout: { write(value: string): unknown }
  wait(milliseconds: number): Promise<void>
}

interface ParsedArguments {
  readonly after?: number
  readonly code?: string
  readonly connection?: string
  readonly concurrency?: number
  readonly cron?: string
  readonly cursor?: string
  readonly description?: string
  readonly every?: string
  readonly expectedRevision?: string
  readonly file?: string
  readonly flow?: string
  readonly follow: boolean
  readonly input?: string
  readonly json: boolean
  readonly limit?: number
  readonly name?: string
  readonly positionals: readonly string[]
  readonly project?: string
  readonly source: 'draft' | 'live'
  readonly status?: RunStatus
  readonly summary: boolean
  readonly sets: readonly string[]
  readonly timeoutMs?: number
  readonly timezone?: string
  readonly unsets: readonly string[]
  readonly wait: boolean
  readonly yes: boolean
}

interface ErrorDetails {
  readonly [key: string]: unknown
}

type ApplyNode =
  | {
      readonly action: string
      readonly connection?: string
      readonly inputs: Readonly<Record<string, JsonValue>>
      readonly kind: 'connector'
      readonly name?: string
    }
  | {
      readonly code: string
      readonly inputs?: Readonly<Record<string, InputPortDefinition>>
      readonly kind: 'code'
      readonly name: string
      readonly outputs?: Readonly<Record<string, PortDefinition>>
    }
  | {
      readonly inputs?: Readonly<Record<string, JsonValue>>
      readonly kind: 'llm-chat' | 'llm-json'
      readonly name: string
      readonly output?: PortDefinition
    }
  | { readonly kind: 'condition' | 'value'; readonly name: string }

interface ApplyEdge {
  readonly input: string
  readonly output: string
  readonly source: string
  readonly target: string
}

type ApplyTrigger =
  | { readonly kind: 'webhook'; readonly name?: string }
  | { readonly kind: 'cron'; readonly name?: string; readonly schedule?: readonly TriggerSchedule[] }
  | {
      readonly config: Readonly<Record<string, JsonValue>>
      readonly connection?: string
      readonly key: string
      readonly kind: 'provider'
      readonly name?: string
      readonly schedule?: readonly TriggerSchedule[]
    }

interface ApplySpec {
  readonly edges: readonly ApplyEdge[]
  readonly nodes: Readonly<Record<string, ApplyNode>>
  readonly triggers: Readonly<Record<string, ApplyTrigger>>
  readonly version: 1
}

class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: ErrorDetails,
  ) {
    super(message)
    this.name = 'CliError'
  }
}

function checkedResourceName(value: string, label: 'Flow' | 'Project'): string {
  const name = value.trim()
  if (resourceNameIssue(name) != null) {
    throw new CliError(
      'cli.invalid-arguments',
      `${label} name must be between 1 and ${resourceNameMaxLength} characters and use only letters, numbers, spaces, hyphens, or underscores.`,
    )
  }
  return name
}

const projectPageLimit = 100
const publicationPageLimit = 100
const runPageLimit = 100
const terminalRunStatuses = new Set<RunStatus>(['canceled', 'completed', 'failed', 'indeterminate'])
const runStatuses: ReadonlySet<RunStatus> = new Set(runStatusValues)

function localized(language: Runtime['language'], english: string, chinese: string): string {
  return language == 'zh-CN' ? chinese : english
}

function parseArguments(args: readonly string[]): ParsedArguments {
  const positionals: string[] = []
  let after: number | undefined
  let code: string | undefined
  let connection: string | undefined
  let concurrency: number | undefined
  let cron: string | undefined
  let cursor: string | undefined
  let description: string | undefined
  let every: string | undefined
  let expectedRevision: string | undefined
  let file: string | undefined
  let flow: string | undefined
  let follow = false
  let input: string | undefined
  let json = false
  let limit: number | undefined
  let name: string | undefined
  let project: string | undefined
  const sets: string[] = []
  let source: ParsedArguments['source'] = 'draft'
  let status: RunStatus | undefined
  let summary = false
  let timeoutMs: number | undefined
  let timezone: string | undefined
  const unsets: string[] = []
  let wait = false
  let yes = false

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (argument == '--json') {
      json = true
    } else if (argument == '--follow') {
      follow = true
    } else if (argument == '--wait') {
      wait = true
    } else if (argument == '--yes') {
      yes = true
    } else if (argument == '--summary') {
      summary = true
    } else if (
      argument == '--project' ||
      argument == '--code' ||
      argument == '--connection' ||
      argument == '--cron' ||
      argument == '--description' ||
      argument == '--every' ||
      argument == '--expected-revision' ||
      argument == '--file' ||
      argument == '--flow' ||
      argument == '--name' ||
      argument == '--source' ||
      argument == '--input' ||
      argument == '--status' ||
      argument == '--cursor' ||
      argument == '--limit' ||
      argument == '--after' ||
      argument == '--concurrency' ||
      argument == '--timeout' ||
      argument == '--timezone' ||
      argument == '--set' ||
      argument == '--unset'
    ) {
      const value = args[++index]
      if (value == null || value.length == 0) throw new CliError('cli.invalid-arguments', `${argument} requires a value.`)
      if (argument == '--project') project = value
      else if (argument == '--code') code = value
      else if (argument == '--connection') connection = value
      else if (argument == '--cron') cron = value
      else if (argument == '--description') description = value
      else if (argument == '--every') every = value
      else if (argument == '--expected-revision') expectedRevision = value
      else if (argument == '--file') file = value
      else if (argument == '--flow') flow = value
      else if (argument == '--name') name = value
      else if (argument == '--input') input = value
      else if (argument == '--cursor') cursor = value
      else if (argument == '--timezone') timezone = value
      else if (argument == '--set') sets.push(value)
      else if (argument == '--unset') unsets.push(value)
      else if (argument == '--source') {
        if (value != 'draft' && value != 'live') throw new CliError('cli.invalid-arguments', '--source must be draft or live.')
        source = value
      } else if (argument == '--status') {
        if (!runStatuses.has(value as RunStatus)) throw new CliError('cli.invalid-arguments', `Unknown Run status ${JSON.stringify(value)}.`)
        status = value as RunStatus
      } else {
        const numeric = Number(value)
        const minimum = argument == '--after' ? 0 : 1
        if (!Number.isSafeInteger(numeric) || numeric < minimum || (argument == '--limit' && numeric > 1000)) {
          throw new CliError('cli.invalid-arguments', `${argument} has an invalid value.`)
        }
        if (argument == '--limit') limit = numeric
        else if (argument == '--after') after = numeric
        else if (argument == '--concurrency') concurrency = numeric
        else timeoutMs = numeric
      }
    } else if (argument.startsWith('--project=')) {
      project = argument.slice('--project='.length)
      if (project.length == 0) throw new CliError('cli.invalid-arguments', '--project requires a value.')
    } else if (argument.startsWith('--flow=')) {
      flow = argument.slice('--flow='.length)
      if (flow.length == 0) throw new CliError('cli.invalid-arguments', '--flow requires a value.')
    } else if (argument.startsWith('--expected-revision=')) {
      expectedRevision = argument.slice('--expected-revision='.length)
      if (expectedRevision.length == 0) throw new CliError('cli.invalid-arguments', '--expected-revision requires a value.')
    } else if (argument.startsWith('--file=')) {
      file = argument.slice('--file='.length)
      if (file.length == 0) throw new CliError('cli.invalid-arguments', '--file requires a value.')
    } else if (argument.startsWith('--name=')) {
      name = argument.slice('--name='.length)
      if (name.length == 0) throw new CliError('cli.invalid-arguments', '--name requires a value.')
    } else if (argument.startsWith('--connection=')) {
      connection = argument.slice('--connection='.length)
      if (connection.length == 0) throw new CliError('cli.invalid-arguments', '--connection requires a value.')
    } else if (argument.startsWith('--set=')) {
      const value = argument.slice('--set='.length)
      if (value.length == 0) throw new CliError('cli.invalid-arguments', '--set requires a value.')
      sets.push(value)
    } else if (argument.startsWith('--unset=')) {
      const value = argument.slice('--unset='.length)
      if (value.length == 0) throw new CliError('cli.invalid-arguments', '--unset requires a value.')
      unsets.push(value)
    } else if (argument.startsWith('--source=')) {
      const value = argument.slice('--source='.length)
      if (value != 'draft' && value != 'live') throw new CliError('cli.invalid-arguments', '--source must be draft or live.')
      source = value
    } else if (argument.startsWith('--input=')) {
      input = argument.slice('--input='.length)
      if (input.length == 0) throw new CliError('cli.invalid-arguments', '--input requires a value.')
    } else if (argument.startsWith('-')) {
      throw new CliError('cli.invalid-arguments', `Unknown option ${JSON.stringify(argument)}.`)
    } else {
      positionals.push(argument)
    }
  }

  return {
    ...(after == null ? {} : { after }),
    ...(code == null ? {} : { code }),
    ...(connection == null ? {} : { connection }),
    ...(concurrency == null ? {} : { concurrency }),
    ...(cron == null ? {} : { cron }),
    ...(cursor == null ? {} : { cursor }),
    ...(description == null ? {} : { description }),
    ...(every == null ? {} : { every }),
    ...(expectedRevision == null ? {} : { expectedRevision }),
    ...(file == null ? {} : { file }),
    ...(flow == null ? {} : { flow }),
    follow,
    ...(input == null ? {} : { input }),
    json,
    ...(limit == null ? {} : { limit }),
    ...(name == null ? {} : { name }),
    positionals,
    ...(project == null ? {} : { project }),
    sets,
    source,
    ...(status == null ? {} : { status }),
    summary,
    ...(timeoutMs == null ? {} : { timeoutMs }),
    ...(timezone == null ? {} : { timezone }),
    unsets,
    wait,
    yes,
  }
}

async function allProjects(client: ControlClient): Promise<readonly Project[]> {
  const projects: Project[] = []
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await client.listProjects({ cursor, limit: projectPageLimit })
    projects.push(...page.projects)
    cursor = page.nextCursor
    if (cursor != null && cursors.has(cursor)) throw new CliError('page.invalid-cursor', 'The deployment returned a repeated Project cursor.')
    if (cursor != null) cursors.add(cursor)
  } while (cursor != null)
  return projects
}

function exactProject(projects: readonly Project[], reference: string): Project {
  const byId = projects.find((project) => project.projectId == reference)
  if (byId != null) return byId
  const byName = projects.filter((project) => project.name == reference)
  if (byName.length == 1) return byName[0]!
  if (byName.length > 1) {
    throw new CliError('project.ambiguous', `Project name ${JSON.stringify(reference)} is ambiguous.`, {
      candidates: byName.map(({ name, projectId }) => ({ name, projectId })),
    })
  }
  throw new CliError('project.not-found', `Project ${JSON.stringify(reference)} was not found.`)
}

async function referencedProject(client: ControlClient, reference: string): Promise<Project> {
  try {
    return await client.getProject(reference)
  } catch (error) {
    if (!(error instanceof ApiError) || (error.code != 'project.invalid' && error.code != 'project.not-found')) throw error
  }
  return exactProject(await allProjects(client), reference)
}

async function currentProject(client: ControlClient, host: CommandHost, args: ParsedArguments, runtime: Runtime): Promise<Project> {
  const reference = args.project ?? runtime.env.OO_FLOW_PROJECT ?? (await host.getProject())
  if (reference == null || reference.length == 0) {
    throw new CliError(
      'flow.project-context-required',
      localized(
        runtime.language,
        'Select a Project with "oo flow project use <project>" or pass --project.',
        '请先使用“oo flow project use <project>”选择项目，或传入 --project。',
      ),
    )
  }
  return await referencedProject(client, reference)
}

function exactFlow(flows: readonly Flow[], reference: string, draftRequired = false): Flow {
  const candidates = flows.filter((flow) => flow.flowId == reference || flow.draft?.name == reference)
  const byId = candidates.find((flow) => flow.flowId == reference)
  if (byId != null) {
    if (draftRequired && byId.draft == null) throw new CliError('flow.draft-not-found', `Flow ${JSON.stringify(reference)} is not in the Draft.`)
    return byId
  }
  if (candidates.length == 1) {
    const flow = candidates[0]!
    if (draftRequired && flow.draft == null) throw new CliError('flow.draft-not-found', `Flow ${JSON.stringify(reference)} is not in the Draft.`)
    return flow
  }
  if (candidates.length > 1) {
    throw new CliError('flow.ambiguous', `Flow name ${JSON.stringify(reference)} is ambiguous.`, {
      candidates: candidates.map((flow) => ({ flowId: flow.flowId, name: flow.draft?.name })),
    })
  }
  throw new CliError('flow.not-found', `Flow ${JSON.stringify(reference)} was not found.`)
}

async function selectedDraftFlow(client: ControlClient, projectId: string, reference: string) {
  const flow = exactFlow(await client.listFlows(projectId), reference, true)
  const draft = await client.getRevision(projectId, flow.draft!.revisionId)
  const graph = draft.content.document.flows[flow.flowId]?.graph
  if (graph == null) throw new CliError('flow.draft-not-found', `Flow ${JSON.stringify(reference)} is not in the selected Revision.`)
  return { draft, flow, graph, target: { id: flow.flowId, kind: 'flow' } as const }
}

type SemanticNode = Exclude<GraphNode, TriggerNode>

function exactNode(nodes: Readonly<Record<string, GraphNode>>, reference: string): { readonly node: SemanticNode; readonly nodeId: string } {
  const byId = nodes[reference]
  if (byId != null && !('inputs' in byId)) throw new CliError('node.not-found', `Node ${JSON.stringify(reference)} was not found.`)
  if (byId != null) return { node: byId, nodeId: reference }
  const byName = Object.entries(nodes).filter((entry): entry is [string, SemanticNode] => 'inputs' in entry[1] && entry[1].name == reference)
  if (byName.length == 1) return { node: byName[0]![1], nodeId: byName[0]![0] }
  if (byName.length > 1) {
    throw new CliError('node.ambiguous', `Node name ${JSON.stringify(reference)} is ambiguous.`, {
      candidates: byName.map(([nodeId, node]) => ({ name: node.name, nodeId })),
    })
  }
  throw new CliError('node.not-found', `Node ${JSON.stringify(reference)} was not found.`)
}

function exactModule(modules: Readonly<Record<string, CodeModule>>, reference: string): { readonly module: CodeModule; readonly moduleId: string } {
  const byId = modules[reference]
  if (byId != null) return { module: byId, moduleId: reference }
  const byName = Object.entries(modules).filter(([, module]) => module.name == reference)
  if (byName.length == 1) return { module: byName[0]![1], moduleId: byName[0]![0] }
  if (byName.length > 1) {
    throw new CliError('code.ambiguous', `CodeModule name ${JSON.stringify(reference)} is ambiguous.`, {
      candidates: byName.map(([moduleId, module]) => ({ moduleId, name: module.name })),
    })
  }
  throw new CliError('code.not-found', `CodeModule ${JSON.stringify(reference)} was not found.`)
}

function exactAction(actions: readonly ConnectorAction[], reference: string): ConnectorAction {
  const byId = actions.find((action) => action.actionId == reference)
  if (byId != null) return byId
  const byName = actions.filter((action) => action.name == reference)
  if (byName.length == 1) return byName[0]!
  if (byName.length > 1) {
    throw new CliError('connector.action-ambiguous', `Connector Action name ${JSON.stringify(reference)} is ambiguous.`, {
      candidates: byName.map(({ actionId, name, serviceId }) => ({ actionId, name, serviceId })),
    })
  }
  throw new CliError('connector.action-not-found', `Connector Action ${JSON.stringify(reference)} was not found.`)
}

async function referencedAction(client: ControlClient, projectId: string, reference: string): Promise<ConnectorAction> {
  try {
    return await client.getConnectorAction(projectId, reference)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status != 404) throw error
  }
  return exactAction(await client.searchConnectorActions(projectId, reference), reference)
}

function exactConnection(connections: readonly ConnectorConnection[], reference: string): ConnectorConnection {
  const active = connections.filter((connection) => connection.status == 'active')
  const byId = active.find((connection) => connection.connectionId == reference)
  if (byId != null) return byId
  const byName = active.filter((connection) => connection.displayName == reference)
  if (byName.length == 1) return byName[0]!
  if (byName.length > 1) {
    throw new CliError('connector.connection-ambiguous', `Connection name ${JSON.stringify(reference)} is ambiguous.`, {
      candidates: byName.map(({ connectionId, displayName, serviceId }) => ({ connectionId, displayName, serviceId })),
    })
  }
  throw new CliError('connector.connection-not-found', `Active Connection ${JSON.stringify(reference)} was not found.`)
}

async function preferredConnection(
  client: ControlClient,
  projectId: string,
  serviceId: string,
  reference: string | undefined,
  fallback: ConnectorConnection | undefined,
  required: boolean,
): Promise<ConnectorConnection | undefined> {
  const selected = reference == 'default' ? undefined : reference
  if (selected == null && fallback?.status == 'active') return fallback
  const connections = await client.listConnectorConnections(projectId, serviceId)
  if (selected != null) return exactConnection(connections, selected)
  const active = connections.filter((connection) => connection.status == 'active')
  const preferred = active.find((connection) => connection.isDefault) ?? (active.length == 1 ? active[0] : undefined)
  if (preferred != null || !required) return preferred
  throw new CliError('connector.connection-required', `Select an active ${JSON.stringify(serviceId)} Connection with --connection.`)
}

function exactTrigger(content: RevisionContent, flowId: string, reference: string): { readonly trigger: TriggerNode; readonly triggerId: string } {
  const flow = content.document.flows[flowId]
  const entries = Object.entries(flow?.graph.nodes ?? {}).filter((entry): entry is [string, TriggerNode] => !('inputs' in entry[1]))
  const byId = entries?.find(([triggerId]) => triggerId == reference)
  if (byId != null) return { trigger: byId[1], triggerId: byId[0] }
  const byName = entries?.filter(([, trigger]) => trigger.name == reference) ?? []
  if (byName.length == 1) return { trigger: byName[0]![1], triggerId: byName[0]![0] }
  if (byName.length > 1) {
    throw new CliError('trigger.ambiguous', `Trigger name ${JSON.stringify(reference)} is ambiguous.`, {
      candidates: byName.map(([triggerId, trigger]) => ({ name: trigger.name, triggerId })),
    })
  }
  throw new CliError('trigger.not-found', `Trigger ${JSON.stringify(reference)} was not found.`)
}

function exactEdgeSource(nodes: Readonly<Record<string, GraphNode>>, reference: string): { readonly id: string; readonly kind: 'node' | 'trigger' } {
  const byId = nodes[reference]
  if (byId != null) return { id: reference, kind: 'inputs' in byId ? 'node' : 'trigger' }
  const candidates = Object.entries(nodes).flatMap(([id, node]) =>
    node.name == reference ? [{ id, kind: ('inputs' in node ? 'node' : 'trigger') as 'node' | 'trigger' }] : [],
  )
  if (candidates.length == 1) return candidates[0]!
  if (candidates.length > 1) {
    throw new CliError('edge.source-ambiguous', `Edge source name ${JSON.stringify(reference)} is ambiguous.`, { candidates })
  }
  throw new CliError('edge.source-not-found', `Edge source ${JSON.stringify(reference)} was not found.`)
}

function triggerKeyText(definition: TriggerKeySummary): string {
  return `${definition.displayName}\t${definition.key}\t${definition.provider}\t${definition.type}`
}

async function referencedTriggerKey(client: ControlClient, reference: string): Promise<TriggerKeySnapshot> {
  try {
    return await client.getTriggerKey(reference)
  } catch (error) {
    if (!(error instanceof ApiError) || error.status != 404) throw error
  }
  const summaries = await client.listTriggerKeys()
  const matches = summaries.filter((item) => item.name == reference || item.displayName == reference)
  if (matches.length == 1) return await client.getTriggerKey(matches[0]!.key)
  if (matches.length > 1) {
    throw new CliError('trigger-key.ambiguous', `Trigger Key name ${JSON.stringify(reference)} is ambiguous.`, {
      candidates: matches.map(({ displayName, key, provider }) => ({ displayName, key, provider })),
    })
  }
  throw new CliError('trigger-key.not-found', `Trigger Key ${JSON.stringify(reference)} was not found.`)
}

function triggerText(content: RevisionContent, triggerId: string, trigger: TriggerNode): string {
  const provider = trigger.kind == 'poll' || trigger.kind == 'integration' ? trigger.definition.provider : 'open-flow'
  const binding = trigger.kind == 'poll' || trigger.kind == 'integration' ? (content.document.bindings[trigger.bindingId]?.target ?? '') : ''
  return `${trigger.name}\t${triggerId}\t${trigger.kind}\t${provider}\t${binding}`
}

function connectionText(connection: ConnectorConnection): string {
  return `${connection.displayName}\t${connection.connectionId}\t${connection.serviceId}\t${connection.status}${connection.isDefault ? '\tdefault' : ''}`
}

function actionText(action: ConnectorAction): string {
  return `${action.name}\t${action.actionId}\t${action.serviceName}\t${action.serviceId}`
}

function actionSummary(action: ConnectorAction) {
  return {
    actionId: action.actionId,
    ...(action.defaultConnection == null
      ? {}
      : {
          defaultConnection: {
            connectionId: action.defaultConnection.connectionId,
            displayName: action.defaultConnection.displayName,
            status: action.defaultConnection.status,
          },
        }),
    description: action.description,
    name: action.name,
    serviceId: action.serviceId,
    serviceName: action.serviceName,
  }
}

function nodeDetails(content: RevisionContent, nodeId: string, node: GraphNode) {
  if (node.kind != 'task') return { node, nodeId }
  if (node.task != null) {
    const module = content.modules[node.task.moduleId]
    return { node, nodeId, task: node.task, ...(module == null ? {} : { module }) }
  }
  const task = content.document.tasks[node.taskId]
  return { node, nodeId, ...(task == null ? {} : { task }) }
}

function inspectedNode(content: RevisionContent, nodeId: string, node: GraphNode) {
  if (node.kind != 'task') return { kind: node.kind, node, nodeId }
  if (node.task != null) {
    return {
      kind: 'code',
      module: content.modules[node.task.moduleId],
      moduleId: node.task.moduleId,
      node,
      nodeId,
      task: node.task,
    }
  }
  const task = content.document.tasks[node.taskId]
  if (task == null) return { kind: 'task', node, nodeId, taskId: node.taskId }
  return {
    ...(task.executor.kind == 'connector'
      ? { actionId: task.executor.action, ...(task.executor.connectionId == null ? {} : { connectionId: task.executor.connectionId }) }
      : {}),
    kind: task.executor.kind,
    node,
    nodeId,
    task,
    taskId: node.taskId,
  }
}

function inspectedNodeSummary(content: RevisionContent, nodeId: string, node: GraphNode) {
  if (node.kind != 'task') return { kind: node.kind, ...(node.name == null ? {} : { name: node.name }), nodeId }
  if (node.task != null) {
    return { kind: 'code', moduleId: node.task.moduleId, ...(node.name == null ? {} : { name: node.name }), nodeId }
  }
  const task = content.document.tasks[node.taskId]
  if (task == null) return { kind: 'task', ...(node.name == null ? {} : { name: node.name }), nodeId, taskId: node.taskId }
  return {
    ...(task.executor.kind == 'connector'
      ? { actionId: task.executor.action, ...(task.executor.connectionId == null ? {} : { connectionId: task.executor.connectionId }) }
      : {}),
    kind: task.executor.kind,
    ...(node.name == null ? {} : { name: node.name }),
    nodeId,
    taskId: node.taskId,
  }
}

function inspectedTriggerSummary(content: RevisionContent, triggerId: string, trigger: TriggerNode) {
  const binding = trigger.kind == 'poll' || trigger.kind == 'integration' ? content.document.bindings[trigger.bindingId] : undefined
  return {
    ...(binding?.kind == 'connection' ? { connectionId: binding.target } : {}),
    kind: trigger.kind,
    name: trigger.name,
    ...(trigger.kind == 'poll' || trigger.kind == 'integration' ? { provider: trigger.definition.provider } : {}),
    triggerId,
  }
}

function inspectedEdges(nodes: Readonly<Record<string, GraphNode>>) {
  return Object.entries(nodes)
    .flatMap(([targetNodeId, node]) => {
      if (!('inputs' in node)) return []
      return Object.entries(node.inputs).flatMap(([input, mapping]) =>
        mapping.kind != 'sources'
          ? []
          : mapping.sources.map((source) => ({
              input,
              source: { ...source },
              target: { nodeId: targetNodeId },
            })),
      )
    })
    .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
}

function requireCount(positionals: readonly string[], count: number, usage: string): void {
  if (positionals.length != count) throw new CliError('cli.invalid-arguments', `Usage: ${usage}`)
}

function write(runtime: Runtime, json: boolean, value: unknown, text: string): void {
  runtime.stdout.write(json ? `${JSON.stringify(value)}\n` : `${text}\n`)
}

function projectText(project: Project): string {
  return `${project.name}\t${project.projectId}\t${project.status}`
}

function flowText(flow: Flow): string {
  const name = flow.draft?.name ?? '<not in Draft>'
  const live = flow.live == null ? 'not-published' : flow.live.status
  return `${name}\t${flow.flowId}\t${live}`
}

function nodeText(nodeId: string, node: GraphNode): string {
  return `${node.name ?? '<unnamed>'}\t${nodeId}\t${node.kind}`
}

function nodeSummary(nodeId: string, node: GraphNode) {
  return { kind: node.kind, ...(node.name == null ? {} : { name: node.name }), nodeId }
}

function moduleText(moduleId: string, module: CodeModule): string {
  return `${module.name}\t${moduleId}\t${module.imports.join(',')}`
}

function publicationText(publication: Publication): string {
  return `${publication.operation}\t${publication.publicationId}\t${publication.revisionId}\t${publication.createdAt}`
}

function runText(run: RunDetails): string {
  const publication = run.source == 'draft' ? '' : `\t${run.publicationId}`
  return `${run.source}\t${run.status}\t${run.runId}\t${run.revisionId}${publication}`
}

function runSummaryText(run: { readonly revisionId: string; readonly runId: string; readonly source: string; readonly status: string }): string {
  return `${run.source}\t${run.status}\t${run.runId}\t${run.revisionId}`
}

function eventText(event: RunEvent): string {
  return `${event.sequence}\t${event.kind}\t${JSON.stringify(event.payload)}`
}

async function argumentText(value: string, option: string, errorCode: string, runtime: Runtime): Promise<string> {
  try {
    if (value == '-') return await runtime.readStdin()
    if (!value.startsWith('@')) return value
    const path = value.slice(1)
    if (path.length == 0) throw new CliError('cli.invalid-arguments', `${option} @ requires a file path.`)
    return await runtime.readFile(path)
  } catch (error) {
    if (error instanceof CliError) throw error
    throw new CliError(errorCode, error instanceof Error ? error.message : String(error))
  }
}

function parsedJson(value: string, code: string, message: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue
  } catch {
    throw new CliError(code, message)
  }
}

function applyObject(value: unknown, message: string): Readonly<Record<string, unknown>> {
  if (value == null || typeof value != 'object' || Array.isArray(value)) throw new CliError('flow.apply-invalid', message)
  return value as Readonly<Record<string, unknown>>
}

function applyString(value: unknown, field: string): string {
  if (typeof value != 'string' || value.trim().length == 0) {
    throw new CliError('flow.apply-invalid', `${field} must be a non-empty string.`)
  }
  return value
}

function applyKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[], field: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unexpected.length > 0) throw new CliError('flow.apply-invalid', `${field} contains unknown fields: ${unexpected.join(', ')}.`)
}

function applyTriggerSchedule(trigger: Readonly<Record<string, unknown>>, reference: string): readonly TriggerSchedule[] | undefined {
  const cron = trigger.cron == null ? undefined : applyString(trigger.cron, `triggers.${reference}.cron`)
  const every = trigger.every == null ? undefined : applyString(trigger.every, `triggers.${reference}.every`)
  const timezone = trigger.timezone == null ? undefined : applyString(trigger.timezone, `triggers.${reference}.timezone`)
  return triggerSchedule(every, cron, timezone)
}

function applyPortDefinitions(value: unknown, field: string, input: boolean): Readonly<Record<string, InputPortDefinition | PortDefinition>> {
  const candidates = applyObject(value, `${field} must be an object keyed by port handle.`)
  return Object.fromEntries(
    Object.entries(candidates).map(([handle, candidate]) => {
      if (handle.trim().length == 0) throw new CliError('flow.apply-invalid', `${field} port handles cannot be empty.`)
      const port = applyObject(candidate, `${field}.${handle} must be an object.`)
      applyKeys(port, input ? ['description', 'jsonSchema', 'nullable', 'value'] : ['description', 'jsonSchema', 'nullable'], `${field}.${handle}`)
      if (!Object.hasOwn(port, 'jsonSchema')) throw new CliError('flow.apply-invalid', `${field}.${handle}.jsonSchema is required.`)
      const jsonSchema =
        typeof port.jsonSchema == 'boolean'
          ? port.jsonSchema
          : (applyObject(port.jsonSchema, `${field}.${handle}.jsonSchema must be an object or boolean.`) as JsonValue)
      if (typeof port.nullable != 'boolean') throw new CliError('flow.apply-invalid', `${field}.${handle}.nullable must be a boolean.`)
      return [
        handle,
        {
          ...(port.description == null ? {} : { description: applyString(port.description, `${field}.${handle}.description`) }),
          jsonSchema,
          nullable: port.nullable,
          ...(input && Object.hasOwn(port, 'value') ? { value: port.value as JsonValue } : {}),
        },
      ]
    }),
  )
}

function applyLlmInputs(value: unknown, field: string): Readonly<Record<string, JsonValue>> {
  const inputs = applyObject(value, `${field} must be an object.`)
  applyKeys(inputs, ['input', 'messages', 'model', 'template'], field)
  return Object.fromEntries(Object.entries(inputs).map(([handle, candidate]) => [handle, applyLlmInput(candidate, `${field}.${handle}`, handle)]))
}

function applyLlmInput(value: unknown, field: string, handle: string): JsonValue {
  switch (handle) {
    case 'input':
      if (typeof value != 'string') throw new CliError('flow.apply-invalid', `${field} must be a string.`)
      return value
    case 'messages':
      if (value == null) return null
      return applyObjectArray(value, field, false)
    case 'model':
      return applyObject(value, `${field} must be an object.`) as JsonValue
    case 'template':
      return applyObjectArray(value, field, true)
    default:
      throw new CliError('flow.apply-invalid', `${field} is not a supported LLM input.`)
  }
}

function applyObjectArray(value: unknown, field: string, nonEmpty: boolean): readonly JsonValue[] {
  if (!Array.isArray(value) || (nonEmpty && value.length == 0) || value.some((item) => item == null || typeof item != 'object' || Array.isArray(item))) {
    throw new CliError('flow.apply-invalid', `${field} must be ${nonEmpty ? 'a non-empty' : 'an'} array of objects.`)
  }
  return value as readonly JsonValue[]
}

function applySpec(source: string): ApplySpec {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new CliError('flow.apply-invalid', 'Flow apply input must be valid JSON.')
  }
  const root = applyObject(parsed, 'Flow apply input must be an object.')
  applyKeys(root, ['edges', 'nodes', 'triggers', 'version'], 'Flow apply input')
  if (root.version !== 1) throw new CliError('flow.apply-invalid', 'Flow apply input version must be 1.')

  const nodeValues = root.nodes == null ? {} : applyObject(root.nodes, 'Flow apply nodes must be an object keyed by local reference.')
  const nodes = Object.fromEntries(
    Object.entries(nodeValues).map(([reference, candidate]) => {
      if (reference.trim().length == 0) throw new CliError('flow.apply-invalid', 'Flow apply node references cannot be empty.')
      const node = applyObject(candidate, `Flow apply node ${JSON.stringify(reference)} must be an object.`)
      const kind = applyString(node.kind, `nodes.${reference}.kind`)
      switch (kind) {
        case 'connector': {
          applyKeys(node, ['action', 'connection', 'inputs', 'kind', 'name'], `nodes.${reference}`)
          const inputs = node.inputs == null ? {} : applyObject(node.inputs, `nodes.${reference}.inputs must be an object.`)
          return [
            reference,
            {
              action: applyString(node.action, `nodes.${reference}.action`),
              ...(node.connection == null ? {} : { connection: applyString(node.connection, `nodes.${reference}.connection`) }),
              inputs: inputs as Readonly<Record<string, JsonValue>>,
              kind,
              ...(node.name == null ? {} : { name: applyString(node.name, `nodes.${reference}.name`) }),
            },
          ] as const
        }
        case 'code': {
          applyKeys(node, ['code', 'inputs', 'kind', 'name', 'outputs'], `nodes.${reference}`)
          return [
            reference,
            {
              code: applyString(node.code, `nodes.${reference}.code`),
              ...(node.inputs == null ? {} : { inputs: applyPortDefinitions(node.inputs, `nodes.${reference}.inputs`, true) }),
              kind,
              name: applyString(node.name, `nodes.${reference}.name`),
              ...(node.outputs == null ? {} : { outputs: applyPortDefinitions(node.outputs, `nodes.${reference}.outputs`, false) }),
            },
          ] as const
        }
        case 'llm-chat':
        case 'llm-json': {
          applyKeys(node, ['inputs', 'kind', 'name', 'outputs'], `nodes.${reference}`)
          const outputs = node.outputs == null ? undefined : applyPortDefinitions(node.outputs, `nodes.${reference}.outputs`, false)
          if (outputs != null) applyKeys(outputs, ['output'], `nodes.${reference}.outputs`)
          return [
            reference,
            {
              ...(node.inputs == null ? {} : { inputs: applyLlmInputs(node.inputs, `nodes.${reference}.inputs`) }),
              kind,
              name: applyString(node.name, `nodes.${reference}.name`),
              ...(outputs?.output == null ? {} : { output: outputs.output }),
            },
          ] as const
        }
        case 'condition':
        case 'value':
          applyKeys(node, ['kind', 'name'], `nodes.${reference}`)
          return [reference, { kind, name: applyString(node.name, `nodes.${reference}.name`) }] as const
        default:
          throw new CliError('flow.apply-invalid', `Unknown Flow apply node kind ${JSON.stringify(kind)}.`)
      }
    }),
  )

  const triggerValues = root.triggers == null ? {} : applyObject(root.triggers, 'Flow apply triggers must be an object keyed by local reference.')
  const triggers = Object.fromEntries(
    Object.entries(triggerValues).map(([reference, candidate]) => {
      if (reference.trim().length == 0) throw new CliError('flow.apply-invalid', 'Flow apply trigger references cannot be empty.')
      const trigger = applyObject(candidate, `Flow apply trigger ${JSON.stringify(reference)} must be an object.`)
      const kind = applyString(trigger.kind, `triggers.${reference}.kind`)
      const name = trigger.name == null ? undefined : applyString(trigger.name, `triggers.${reference}.name`)
      switch (kind) {
        case 'webhook':
          applyKeys(trigger, ['kind', 'name'], `triggers.${reference}`)
          return [reference, { kind, ...(name == null ? {} : { name }) }] as const
        case 'cron': {
          applyKeys(trigger, ['cron', 'every', 'kind', 'name', 'timezone'], `triggers.${reference}`)
          const schedule = applyTriggerSchedule(trigger, reference)
          return [reference, { kind, ...(name == null ? {} : { name }), ...(schedule == null ? {} : { schedule }) }] as const
        }
        case 'provider': {
          applyKeys(trigger, ['config', 'connection', 'cron', 'every', 'key', 'kind', 'name', 'timezone'], `triggers.${reference}`)
          const config = trigger.config == null ? {} : applyObject(trigger.config, `triggers.${reference}.config must be an object.`)
          const connection = trigger.connection == null ? undefined : applyString(trigger.connection, `triggers.${reference}.connection`)
          const schedule = applyTriggerSchedule(trigger, reference)
          return [
            reference,
            {
              config: config as Readonly<Record<string, JsonValue>>,
              ...(connection == null ? {} : { connection }),
              key: applyString(trigger.key, `triggers.${reference}.key`),
              kind,
              ...(name == null ? {} : { name }),
              ...(schedule == null ? {} : { schedule }),
            },
          ] as const
        }
        default:
          throw new CliError('flow.apply-invalid', `Unknown Flow apply trigger kind ${JSON.stringify(kind)}.`)
      }
    }),
  )
  const duplicateReferences = Object.keys(nodes).filter((reference) => triggers[reference] != null)
  if (duplicateReferences.length > 0) {
    throw new CliError('flow.apply-invalid', `Flow apply references must be unique across nodes and triggers: ${duplicateReferences.join(', ')}.`)
  }

  const edgeValues = root.edges ?? []
  if (!Array.isArray(edgeValues)) throw new CliError('flow.apply-invalid', 'Flow apply edges must be an array.')
  const edges = edgeValues.map((candidate, index) => {
    const edge = applyObject(candidate, `edges[${index}] must be an object.`)
    applyKeys(edge, ['input', 'output', 'source', 'target'], `edges[${index}]`)
    return {
      input: applyString(edge.input, `edges[${index}].input`),
      output: applyString(edge.output, `edges[${index}].output`),
      source: applyString(edge.source, `edges[${index}].source`),
      target: applyString(edge.target, `edges[${index}].target`),
    }
  })
  if (Object.keys(nodes).length == 0 && Object.keys(triggers).length == 0 && edges.length == 0) {
    throw new CliError('flow.apply-invalid', 'Flow apply input contains no changes.')
  }
  return { edges, nodes, triggers, version: 1 }
}

type SettingPorts = Readonly<Record<string, { readonly jsonSchema: JsonValue }>>

function inlineSettingValue(source: string, schema: JsonValue | undefined, name: string): JsonValue {
  const schemaObject = schema != null && typeof schema == 'object' && !Array.isArray(schema) ? (schema as Readonly<Record<string, JsonValue>>) : undefined
  const type = typeof schemaObject?.type == 'string' ? schemaObject.type : undefined
  const choices = Array.isArray(schemaObject?.enum) ? (schemaObject.enum as readonly JsonValue[]) : undefined
  if (type == 'string' || (choices?.length != null && choices.length > 0 && choices.every((value) => typeof value == 'string'))) return source
  try {
    return JSON.parse(source) as JsonValue
  } catch {
    if (type == null) return source
    throw new CliError('config.invalid', `--set ${name}= must contain a valid ${type} value.`)
  }
}

async function settingValues(args: ParsedArguments, runtime: Runtime, ports?: SettingPorts): Promise<Readonly<Record<string, JsonValue | undefined>>> {
  const values: Record<string, JsonValue | undefined> = {}
  for (const setting of args.sets) {
    const separator = setting.indexOf('=')
    if (separator < 0) {
      const source = await argumentText(setting, '--set', 'config.unreadable', runtime)
      const object = parsedJson(source, 'config.invalid', '--set @file or --set - must contain a JSON object.')
      if (object == null || typeof object != 'object' || Array.isArray(object)) {
        throw new CliError('config.invalid', '--set @file or --set - must contain a JSON object.')
      }
      Object.assign(values, object)
      continue
    }
    const name = setting.slice(0, separator).trim()
    const source = setting.slice(separator + 1)
    if (name.length == 0) throw new CliError('config.invalid', '--set requires a field name before =.')
    if (source.startsWith('@') || source == '-') {
      values[name] = parsedJson(await argumentText(source, '--set', 'config.unreadable', runtime), 'config.invalid', `--set ${name}= must contain valid JSON.`)
      continue
    }
    values[name] = inlineSettingValue(source, ports?.[name]?.jsonSchema, name)
  }
  for (const name of args.unsets) {
    if (name.length == 0) throw new CliError('config.invalid', '--unset requires a field name.')
    values[name] = undefined
  }
  return values
}

function triggerSchedule(every: string | undefined, cron: string | undefined, timezone: string | undefined): readonly TriggerSchedule[] | undefined {
  if (every != null && cron != null) throw new CliError('trigger.schedule-invalid', 'Use either every or cron, not both.')
  if (every != null) {
    if (timezone != null) throw new CliError('trigger.schedule-invalid', 'Timezone is only valid with cron.')
    const match = /^(\d+)(mo|m|h|d|w)$/.exec(every)
    const value = Number(match?.[1])
    if (match == null || !Number.isSafeInteger(value) || value < 1) {
      throw new CliError('trigger.schedule-invalid', 'Every must use a positive interval such as 5m, 1h, 1d, 1w, or 1mo.')
    }
    const units = { d: 'day', h: 'hour', m: 'minute', mo: 'month', w: 'week' } as const
    return [{ type: 'every', unit: units[match[2] as keyof typeof units], value }]
  }
  if (cron != null) return [{ expression: cron, timezone: timezone ?? 'UTC', type: 'cron' }]
  if (timezone != null) throw new CliError('trigger.schedule-invalid', 'Timezone requires cron.')
}

function withInputValues(action: ConnectorAction, values: Readonly<Record<string, JsonValue | undefined>>): ConnectorAction['inputs'] {
  const inputs = { ...action.inputs }
  for (const [handle, value] of Object.entries(values)) {
    const input = inputs[handle]
    if (input == null) throw new CliError('connector.input-not-found', `Connector input ${JSON.stringify(handle)} was not found.`)
    const { value: _value, ...rest } = input
    inputs[handle] = value === undefined ? rest : { ...rest, value }
  }
  return inputs
}

async function runInputs(args: ParsedArguments, runtime: Runtime): Promise<Readonly<Record<string, Readonly<Record<string, JsonValue>>>>> {
  if (args.input == null) return {}
  const source = await argumentText(args.input, '--input', 'run.input-unreadable', runtime)
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    throw new CliError('run.input-invalid', 'Run input must be valid JSON.')
  }
  if (value == null || typeof value != 'object' || Array.isArray(value)) {
    throw new CliError('run.input-invalid', 'Run input must be an object keyed by node ID.')
  }
  for (const candidate of Object.values(value)) {
    if (candidate == null || typeof candidate != 'object' || Array.isArray(candidate)) {
      throw new CliError('run.input-invalid', 'Each Run input node must contain an object keyed by input handle.')
    }
  }
  return value as Readonly<Record<string, Readonly<Record<string, JsonValue>>>>
}

async function publicationById(client: ControlClient, projectId: string, flowId: string, publicationId: string): Promise<Publication> {
  const cursors = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await client.listPublications(projectId, flowId, { cursor, limit: publicationPageLimit })
    const found = page.publications.find((publication) => publication.publicationId == publicationId)
    if (found != null) return found
    cursor = page.nextCursor
    if (cursor != null && cursors.has(cursor)) throw new CliError('page.invalid-cursor', 'The deployment returned a repeated Publication cursor.')
    if (cursor != null) cursors.add(cursor)
  } while (cursor != null)
  throw new CliError('publication.not-found', `Publication ${JSON.stringify(publicationId)} was not found.`)
}

async function waitForRun(client: ControlClient, projectId: string, created: RunDetails, runtime: Runtime): Promise<RunDetails> {
  let current = created
  while (!terminalRunStatuses.has(current.status)) {
    await runtime.wait(1_000)
    current = await client.getRun(projectId, current.runId)
  }
  return current
}

function cloudError(error: ApiError): CliError {
  return new CliError(error.code, error.message, { status: error.status })
}

async function changeDraft(
  client: ControlClient,
  projectId: string,
  baseRevisionId: string,
  target: ErrorDetails,
  operations: Parameters<ControlClient['changeDraft']>[2],
) {
  try {
    return await client.changeDraft(projectId, baseRevisionId, operations)
  } catch (error) {
    if (error instanceof ApiError && error.code != 'response.invalid') throw cloudError(error)
    throw new CliError(
      'flow.mutation-outcome-unknown',
      'The deployment did not confirm whether the Draft change was accepted. Read the Flow again before retrying.',
      {
        baseRevisionId,
        projectId,
        target,
      },
    )
  }
}

async function projectCommand(client: ControlClient, host: CommandHost, args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, ...operands] = args.positionals.slice(1)
  switch (operation) {
    case 'list': {
      requireCount(operands, 0, 'oo flow project list [--json]')
      const projects = await allProjects(client)
      write(runtime, args.json, { kind: 'project.list', projects, version: 1 }, projects.map(projectText).join('\n'))
      return
    }
    case 'create': {
      requireCount(operands, 1, 'oo flow project create <name> [--json]')
      const name = checkedResourceName(operands[0]!, 'Project')
      const project = await client.createProject(name)
      write(runtime, args.json, { kind: 'project.create', project, version: 1 }, projectText(project))
      return
    }
    case 'show': {
      if (operands.length > 1) throw new CliError('cli.invalid-arguments', 'Usage: oo flow project show [project] [--json]')
      const project = operands[0] == null ? await currentProject(client, host, args, runtime) : await referencedProject(client, operands[0])
      write(runtime, args.json, { kind: 'project.show', project, version: 1 }, projectText(project))
      return
    }
    case 'use': {
      requireCount(operands, 1, 'oo flow project use <project> [--json]')
      const project = await referencedProject(client, operands[0]!)
      await host.setProject(project.projectId)
      write(runtime, args.json, { kind: 'project.use', project, version: 1 }, projectText(project))
      return
    }
    case 'current': {
      requireCount(operands, 0, 'oo flow project current [--json]')
      const project = await currentProject(client, host, args, runtime)
      write(runtime, args.json, { kind: 'project.current', project, version: 1 }, projectText(project))
      return
    }
    default:
      throw new CliError('cli.invalid-arguments', 'Usage: oo flow project <list|create|show|use|current>')
  }
}

async function createRunCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  requireCount(operands, 1, 'oo flow run <flow> [--source draft|live] [--input <json|@file|->] [--wait] [--json]')
  const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!, args.source == 'draft')
  const inputs = await runInputs(args, runtime)
  let created: RunDetails =
    args.source == 'draft'
      ? await client.createDraftRun(project.projectId, flow.draft!.revisionId, flow.flowId, { inputs })
      : await client.createLiveRun(project.projectId, flow.flowId, { inputs })
  if (args.wait) created = await waitForRun(client, project.projectId, created, runtime)
  write(runtime, args.json, { kind: 'run.create', run: created, version: 1 }, runText(created))
}

async function runsCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, ...references] = operands
  switch (operation) {
    case 'list': {
      requireCount(references, 0, 'oo flow runs list [--flow <flow>] [--status <status>] [--cursor <cursor>] [--limit <count>] [--json]')
      const flow = args.flow == null ? undefined : exactFlow(await client.listFlows(project.projectId), args.flow)
      const page = await client.listRuns(project.projectId, {
        ...(args.cursor == null ? {} : { cursor: args.cursor }),
        ...(flow == null ? {} : { flowId: flow.flowId }),
        limit: args.limit ?? runPageLimit,
        ...(args.status == null ? {} : { status: args.status }),
      })
      write(runtime, args.json, { kind: 'run.list', ...page, version: 1 }, page.runs.map(runSummaryText).join('\n'))
      return
    }
    case 'show': {
      requireCount(references, 1, 'oo flow runs show <run> [--json]')
      const run = await client.getRun(project.projectId, references[0]!)
      write(runtime, args.json, { kind: 'run.show', run, version: 1 }, runText(run))
      return
    }
    case 'events': {
      requireCount(references, 1, 'oo flow runs events <run> [--after <sequence>] [--limit <count>] [--follow] [--json]')
      let after = args.after ?? 0
      const events: RunEvent[] = []
      let page: RunEvents
      do {
        page = await client.getRunEvents(project.projectId, references[0]!, { after, limit: args.limit ?? runPageLimit })
        events.push(...page.events)
        after = page.nextAfter
        if (args.follow && !page.done && page.events.length == 0) await runtime.wait(1_000)
      } while (args.follow && !page.done)
      write(runtime, args.json, { ...page, events, kind: 'run.events', version: 1 }, events.map(eventText).join('\n'))
      return
    }
    case 'result': {
      requireCount(references, 1, 'oo flow runs result <run> [--json]')
      const result = await client.getRunResult(project.projectId, references[0]!)
      write(runtime, args.json, { kind: 'run.result', result, version: 1 }, JSON.stringify(result))
      return
    }
    case 'cancel': {
      requireCount(references, 1, 'oo flow runs cancel <run> [--json]')
      const cancellation = await client.cancelRun(project.projectId, references[0]!)
      write(
        runtime,
        args.json,
        { cancellation, kind: 'run.cancel', version: 1 },
        `${cancellation.status}\t${cancellation.runId}\t${cancellation.cancelAccepted ? 'accepted' : 'already-terminal'}`,
      )
      return
    }
    default:
      throw new CliError('cli.invalid-arguments', 'Usage: oo flow runs <list|show|events|result|cancel>')
  }
}

async function publishCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  requireCount(operands, 1, 'oo flow publish <flow> [--json]')
  const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!, true)
  const live = await client.getLive(project.projectId, flow.flowId)
  const published = await client.publishFlow(project.projectId, flow.draft!.revisionId, flow.flowId, live.publication?.publicationId ?? null)
  write(runtime, args.json, { kind: 'publication.publish', publication: published, version: 1 }, publicationText(published))
}

async function publicationsCommand(
  client: ControlClient,
  project: Project,
  operands: readonly string[],
  args: ParsedArguments,
  runtime: Runtime,
): Promise<void> {
  const [operation, flowReference, publicationId, ...extra] = operands
  if (flowReference == null || extra.length > 0) {
    throw new CliError('cli.invalid-arguments', 'Usage: oo flow publications <list|show> <flow> [publication]')
  }
  const flow = exactFlow(await client.listFlows(project.projectId), flowReference)
  if (operation == 'list') {
    if (publicationId != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow publications list <flow> [--cursor <cursor>] [--limit <count>]')
    const page = await client.listPublications(project.projectId, flow.flowId, {
      ...(args.cursor == null ? {} : { cursor: args.cursor }),
      limit: args.limit ?? publicationPageLimit,
    })
    write(runtime, args.json, { flow, kind: 'publication.list', project, ...page, version: 1 }, page.publications.map(publicationText).join('\n'))
    return
  }
  if (operation == 'show' && publicationId != null) {
    const publication = await publicationById(client, project.projectId, flow.flowId, publicationId)
    write(runtime, args.json, { kind: 'publication.show', publication, version: 1 }, publicationText(publication))
    return
  }
  throw new CliError('cli.invalid-arguments', 'Usage: oo flow publications <list|show> <flow> [publication]')
}

async function rollbackCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  requireCount(operands, 2, 'oo flow rollback <flow> <publication> [--json]')
  const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!)
  const source = await publicationById(client, project.projectId, flow.flowId, operands[1]!)
  const live = await client.getLive(project.projectId, flow.flowId)
  if (live.publication == null) throw new CliError('live.not-found', `Flow ${JSON.stringify(operands[0])} has no Live Publication.`)
  const rolledBack = await client.rollbackFlow(project.projectId, flow.flowId, source.publicationId, live.publication.publicationId)
  write(runtime, args.json, { kind: 'publication.rollback', publication: rolledBack, version: 1 }, publicationText(rolledBack))
}

async function connectorCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, first, second, ...extra] = operands
  switch (operation) {
    case 'list': {
      if (first != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow connector list [--json]')
      const actions = await client.listConnectorActions(project.projectId)
      write(
        runtime,
        args.json,
        { actions: actions.map(actionSummary), kind: 'connector.list', projectId: project.projectId, version: 1 },
        actions.map(actionText).join('\n'),
      )
      return
    }
    case 'search': {
      if (first == null || second != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow connector search <query> [--json]')
      const query = first.trim()
      if (query.length == 0 || query.length > 256) throw new CliError('cli.invalid-arguments', 'Connector search query must contain 1–256 characters.')
      const actions = await client.searchConnectorActions(project.projectId, query)
      write(
        runtime,
        args.json,
        { actions: actions.map(actionSummary), kind: 'connector.search', projectId: project.projectId, query, version: 1 },
        actions.map(actionText).join('\n'),
      )
      return
    }
    case 'show': {
      if (first == null || second != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow connector show <action> [--json]')
      const action = await referencedAction(client, project.projectId, first)
      write(runtime, args.json, { action, kind: 'connector.show', projectId: project.projectId, version: 1 }, actionText(action))
      return
    }
    case 'connections': {
      if (first == null || second != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow connector connections <service> [--json]')
      const connections = await client.listConnectorConnections(project.projectId, first)
      write(
        runtime,
        args.json,
        { connections, kind: 'connector.connections', projectId: project.projectId, serviceId: first, version: 1 },
        connections.map(connectionText).join('\n'),
      )
      return
    }
    case 'add': {
      if (first == null || second == null || extra.length > 0) {
        throw new CliError(
          'cli.invalid-arguments',
          'Usage: oo flow connector add <flow> <action> [--name <name>] [--connection <connection>] [--set <input=value>] [--json]',
        )
      }
      const selected = await selectedDraftFlow(client, project.projectId, first)
      const action = await referencedAction(client, project.projectId, second)
      const values = await settingValues(args, runtime, action.inputs)
      const connection = await preferredConnection(client, project.projectId, action.serviceId, args.connection, action.defaultConnection, false)
      const name = args.name?.trim() ?? action.name
      if (name.length == 0) throw new CliError('cli.invalid-arguments', 'Connector Node name cannot be empty.')
      const nodeId = crypto.randomUUID()
      const taskId = crypto.randomUUID()
      const operations = createManagedTask(
        selected.target,
        { nodeId, taskId },
        {
          executor: { action: action.actionId, ...(connection == null ? {} : { connectionId: connection.connectionId }), kind: 'connector' },
          inputs: withInputValues(action, values),
          name,
          outputs: action.outputs,
        },
      )
      const target = { actionId: action.actionId, flowId: selected.flow.flowId, kind: 'connector', nodeId, taskId }
      const changed = await changeDraft(client, project.projectId, selected.draft.revisionId, target, operations)
      write(
        runtime,
        args.json,
        {
          ...(connection == null ? {} : { connection }),
          connectionId: connection?.connectionId,
          kind: 'connector.add',
          revision: changed.revision,
          target,
          version: 1,
        },
        `${name}\t${nodeId}\t${action.actionId}\t${connection?.connectionId ?? 'unconfigured'}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'set': {
      if (first == null || second == null || extra.length > 0 || (args.connection == null && args.sets.length == 0 && args.unsets.length == 0)) {
        throw new CliError(
          'cli.invalid-arguments',
          'Usage: oo flow connector set <flow> <node> [--connection <connection>] [--set <input=value>] [--unset <input>] [--json]',
        )
      }
      const selected = await selectedDraftFlow(client, project.projectId, first)
      const resolved = exactNode(selected.graph.nodes, second)
      if (resolved.node.kind != 'task' || resolved.node.task != null) {
        throw new CliError('connector.node-invalid', `Node ${JSON.stringify(second)} is not a Connector Node.`)
      }
      const task = selected.draft.content.document.tasks[resolved.node.taskId]
      if (task == null || !('executor' in task) || task.executor.kind != 'connector') {
        throw new CliError('connector.node-invalid', `Node ${JSON.stringify(second)} is not a Connector Node.`)
      }
      const values = await settingValues(args, runtime, task.inputs)
      for (const handle of Object.keys(values)) {
        if (task.inputs[handle] == null) throw new CliError('connector.input-not-found', `Connector input ${JSON.stringify(handle)} was not found.`)
      }
      const inputChanged = Object.entries(values).some(([handle, value]) => {
        const current = resolved.node.inputs[handle]
        return value === undefined ? current != null : current?.kind != 'value' || JSON.stringify(current.value) != JSON.stringify(value)
      })
      let connectionId = task.executor.connectionId
      if (args.connection != null) {
        const action = await client.getConnectorAction(project.projectId, task.executor.action)
        connectionId = (await preferredConnection(client, project.projectId, action.serviceId, args.connection, action.defaultConnection, true))!.connectionId
      }
      const connectionChanged = connectionId != task.executor.connectionId
      if (!inputChanged && !connectionChanged) {
        write(
          runtime,
          args.json,
          {
            changed: false,
            connectionId,
            flowId: selected.flow.flowId,
            kind: 'connector.set',
            nodeId: resolved.nodeId,
            projectId: project.projectId,
            revisionId: selected.draft.revisionId,
            version: 1,
          },
          `${resolved.node.name ?? task.name}\t${resolved.nodeId}\tunchanged\t${selected.draft.revisionId}`,
        )
        return
      }
      const operations = [
        ...(connectionChanged ? setConnectorConnection(selected.draft.content, resolved.node.taskId, connectionId!)! : []),
        ...(inputChanged ? setInputValues(selected.draft.content, selected.target, resolved.nodeId, values)! : []),
      ]
      const target = { flowId: selected.flow.flowId, kind: 'connector', nodeId: resolved.nodeId, taskId: resolved.node.taskId }
      const changed = await changeDraft(client, project.projectId, selected.draft.revisionId, target, operations)
      write(
        runtime,
        args.json,
        { connectionId, kind: 'connector.set', revision: changed.revision, target, version: 1 },
        `${resolved.node.name ?? task.name}\t${resolved.nodeId}\t${connectionId ?? 'unconfigured'}\t${changed.revision.revisionId}`,
      )
      return
    }
    default:
      throw new CliError('cli.invalid-arguments', 'Usage: oo flow connector <list|search|show|connections|add|set> ...')
  }
}

async function triggerCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, first, second, ...extra] = operands
  switch (operation) {
    case 'search': {
      if (first == null || second != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow trigger search <query> [--json]')
      const query = first.trim().toLowerCase()
      if (query.length == 0) throw new CliError('cli.invalid-arguments', 'Trigger search query cannot be empty.')
      const definitions = (await client.listTriggerKeys()).filter((item) =>
        [item.description, item.displayName, item.key, item.name, item.provider, item.type].some((value) => value.toLowerCase().includes(query)),
      )
      write(runtime, args.json, { definitions, kind: 'trigger.search', query, version: 1 }, definitions.map(triggerKeyText).join('\n'))
      return
    }
    case 'show': {
      if (first == null || second != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow trigger show <key> [--json]')
      const definition = await referencedTriggerKey(client, first)
      write(runtime, args.json, { definition, kind: 'trigger.show', version: 1 }, triggerKeyText(definition))
      return
    }
    case 'list': {
      if (first == null || second != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow trigger list <flow> [--json]')
      const selected = await selectedDraftFlow(client, project.projectId, first)
      const entries = Object.entries(selected.graph.nodes).filter((entry): entry is [string, TriggerNode] => !('inputs' in entry[1]))
      const triggers = entries.map(([triggerId, trigger]) => ({ trigger, triggerId }))
      write(
        runtime,
        args.json,
        {
          flowId: selected.flow.flowId,
          kind: 'trigger.list',
          projectId: project.projectId,
          revisionId: selected.draft.revisionId,
          triggers,
          version: 1,
        },
        entries.map(([triggerId, trigger]) => triggerText(selected.draft.content, triggerId, trigger)).join('\n'),
      )
      return
    }
    case 'add': {
      if (first == null || second == null || extra.length > 0) {
        throw new CliError(
          'cli.invalid-arguments',
          'Usage: oo flow trigger add <flow> <webhook|cron|trigger-key> [--name <name>] [--connection <connection>] [--set <field=value>] [--every <interval>|--cron <expression>] [--json]',
        )
      }
      const selected = await selectedDraftFlow(client, project.projectId, first)
      const configuredSchedule = triggerSchedule(args.every, args.cron, args.timezone)
      const values = await settingValues(args, runtime)
      const config = Object.fromEntries(Object.entries(values).filter((entry): entry is [string, JsonValue] => entry[1] !== undefined))
      const triggerId = crypto.randomUUID()
      let operations
      let name: string
      let kind: TriggerNode['kind']
      if (second == 'webhook') {
        if (args.connection != null || configuredSchedule != null || Object.keys(values).length > 0) {
          throw new CliError('trigger.config-invalid', 'Webhook creation only accepts --name; configure request and response fields in Workbench.')
        }
        name = args.name?.trim() ?? 'Webhook'
        kind = 'webhook'
        operations = createBuiltinTrigger(selected.target, triggerId, { inputsDef: [], kind, name })
      } else if (second == 'cron') {
        if (args.connection != null || Object.keys(values).length > 0) {
          throw new CliError('trigger.config-invalid', 'Cron creation does not accept --connection or --set.')
        }
        name = args.name?.trim() ?? 'Scheduled Trigger'
        kind = 'cron'
        operations = createBuiltinTrigger(selected.target, triggerId, {
          cronTimes: configuredSchedule ?? [{ type: 'every', unit: 'hour', value: 1 }],
          kind,
          name,
        })
      } else {
        const definition = await referencedTriggerKey(client, second)
        const connection = await preferredConnection(client, project.projectId, definition.provider, args.connection, undefined, true)
        name = args.name?.trim() ?? definition.displayName
        kind = definition.type
        operations = createProviderTrigger(selected.target, { bindingId: crypto.randomUUID(), nodeId: triggerId }, definition, {
          config,
          connectionId: connection!.connectionId,
          name,
          ...(configuredSchedule == null ? {} : { schedule: configuredSchedule }),
        })
      }
      if (name.length == 0) throw new CliError('cli.invalid-arguments', 'Trigger name cannot be empty.')
      const target = { flowId: selected.flow.flowId, kind: 'trigger', triggerId }
      const changed = await changeDraft(client, project.projectId, selected.draft.revisionId, target, operations)
      write(
        runtime,
        args.json,
        { kind: 'trigger.add', revision: changed.revision, target: { ...target, name, triggerKind: kind }, version: 1 },
        `${name}\t${triggerId}\t${kind}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'set': {
      if (first == null || second == null || extra.length > 0) {
        throw new CliError(
          'cli.invalid-arguments',
          'Usage: oo flow trigger set <flow> <trigger> [--name <name>] [--description <text>] [--connection <connection>] [--set <field=value>] [--unset <field>] [--every <interval>|--cron <expression>] [--json]',
        )
      }
      const selected = await selectedDraftFlow(client, project.projectId, first)
      const resolved = exactTrigger(selected.draft.content, selected.flow.flowId, second)
      const configuredSchedule = triggerSchedule(args.every, args.cron, args.timezone)
      const values = await settingValues(args, runtime)
      const changesTrigger = args.name != null || args.description != null || configuredSchedule != null || args.sets.length > 0 || args.unsets.length > 0
      if (!changesTrigger && args.connection == null) {
        throw new CliError('cli.invalid-arguments', 'Trigger set requires a field to change.')
      }
      if ((args.sets.length > 0 || args.unsets.length > 0) && resolved.trigger.kind != 'poll' && resolved.trigger.kind != 'integration') {
        throw new CliError('trigger.config-invalid', '--set and --unset require a poll or integration Trigger.')
      }
      if (configuredSchedule != null && resolved.trigger.kind != 'cron' && resolved.trigger.kind != 'poll') {
        throw new CliError('trigger.schedule-invalid', 'Only cron and poll Triggers have schedules.')
      }
      if (args.connection != null && resolved.trigger.kind != 'poll' && resolved.trigger.kind != 'integration') {
        throw new CliError('trigger.connection-invalid', 'Only poll and integration Triggers have Connections.')
      }
      const operations = []
      if (changesTrigger) {
        const name = args.name?.trim() ?? resolved.trigger.name
        if (name.length == 0) throw new CliError('cli.invalid-arguments', 'Trigger name cannot be empty.')
        const description = args.description ?? resolved.trigger.description
        let changedTrigger
        switch (resolved.trigger.kind) {
          case 'webhook':
            changedTrigger = updateTrigger(selected.draft.content, selected.target, resolved.triggerId, {
              ...(description == null ? {} : { description }),
              inputs: resolved.trigger.inputsDef,
              kind: 'webhook',
              name,
              options: resolved.trigger.options ?? {},
            })
            break
          case 'cron':
            changedTrigger = updateTrigger(selected.draft.content, selected.target, resolved.triggerId, {
              ...(description == null ? {} : { description }),
              kind: 'cron',
              name,
              schedule: configuredSchedule ?? resolved.trigger.cronTimes,
            })
            break
          case 'poll': {
            const config = { ...resolved.trigger.config }
            for (const [field, value] of Object.entries(values)) {
              if (value === undefined) delete config[field]
              else config[field] = value
            }
            changedTrigger = updateTrigger(selected.draft.content, selected.target, resolved.triggerId, {
              ...(description == null ? {} : { description }),
              config,
              kind: 'poll',
              name,
              schedule: configuredSchedule ?? resolved.trigger.pollTimes,
            })
            break
          }
          case 'integration': {
            const config = { ...resolved.trigger.config }
            for (const [field, value] of Object.entries(values)) {
              if (value === undefined) delete config[field]
              else config[field] = value
            }
            changedTrigger = updateTrigger(selected.draft.content, selected.target, resolved.triggerId, {
              ...(description == null ? {} : { description }),
              config,
              kind: 'integration',
              name,
            })
            break
          }
        }
        const replacement = changedTrigger?.[0]
        if (replacement?.kind == 'graph.node.replace' && JSON.stringify(replacement.node) != JSON.stringify(resolved.trigger)) {
          operations.push(replacement)
        }
      }
      if (args.connection != null && (resolved.trigger.kind == 'poll' || resolved.trigger.kind == 'integration')) {
        const connection = await preferredConnection(client, project.projectId, resolved.trigger.definition.provider, args.connection, undefined, true)
        const binding = selected.draft.content.document.bindings[resolved.trigger.bindingId]
        if (binding?.target != connection!.connectionId)
          operations.push(...setTriggerConnection(selected.draft.content, selected.target, resolved.triggerId, connection!.connectionId)!)
      }
      if (operations.length == 0) {
        write(
          runtime,
          args.json,
          {
            changed: false,
            flowId: selected.flow.flowId,
            kind: 'trigger.set',
            projectId: project.projectId,
            revisionId: selected.draft.revisionId,
            triggerId: resolved.triggerId,
            version: 1,
          },
          `${triggerText(selected.draft.content, resolved.triggerId, resolved.trigger)}\tunchanged\t${selected.draft.revisionId}`,
        )
        return
      }
      const target = { flowId: selected.flow.flowId, kind: 'trigger', triggerId: resolved.triggerId }
      const changed = await changeDraft(client, project.projectId, selected.draft.revisionId, target, operations)
      write(
        runtime,
        args.json,
        { kind: 'trigger.set', revision: changed.revision, target, version: 1 },
        `${resolved.trigger.name}\t${resolved.triggerId}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'remove': {
      if (first == null || second == null || extra.length > 0) {
        throw new CliError('cli.invalid-arguments', 'Usage: oo flow trigger remove <flow> <trigger> --yes [--json]')
      }
      if (!args.yes) throw new CliError('trigger.confirmation-required', 'Trigger removal requires --yes.')
      const selected = await selectedDraftFlow(client, project.projectId, first)
      const resolved = exactTrigger(selected.draft.content, selected.flow.flowId, second)
      const target = { flowId: selected.flow.flowId, kind: 'trigger', triggerId: resolved.triggerId }
      const changed = await changeDraft(
        client,
        project.projectId,
        selected.draft.revisionId,
        target,
        deleteNodes(selected.draft.content, selected.target, [resolved.triggerId]),
      )
      write(
        runtime,
        args.json,
        { kind: 'trigger.remove', revision: changed.revision, target, version: 1 },
        `${resolved.trigger.name}\t${resolved.triggerId}\t${changed.revision.revisionId}`,
      )
      return
    }
    default:
      throw new CliError('cli.invalid-arguments', 'Usage: oo flow trigger <search|show|list|add|set|remove> ...')
  }
}

async function codeCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, moduleReference, ...extra] = operands
  const draft = await client.getDraft(project.projectId)

  switch (operation) {
    case 'list': {
      if (moduleReference != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow code list [--json]')
      const entries = Object.entries(draft.content.modules).toSorted(
        (left, right) => left[1].name.localeCompare(right[1].name) || left[0].localeCompare(right[0]),
      )
      const modules = entries.map(([moduleId, module]) => ({ imports: module.imports, moduleId, name: module.name }))
      write(
        runtime,
        args.json,
        { kind: 'code.list', modules, projectId: project.projectId, revisionId: draft.revisionId, version: 1 },
        entries.map(([moduleId, module]) => moduleText(moduleId, module)).join('\n'),
      )
      return
    }
    case 'show': {
      if (moduleReference == null || extra.length > 0) throw new CliError('cli.invalid-arguments', 'Usage: oo flow code show <module> [--json]')
      const resolved = exactModule(draft.content.modules, moduleReference)
      if (args.json) {
        write(
          runtime,
          true,
          { kind: 'code.show', module: resolved.module, moduleId: resolved.moduleId, projectId: project.projectId, revisionId: draft.revisionId, version: 1 },
          '',
        )
      } else {
        runtime.stdout.write(resolved.module.source.endsWith('\n') ? resolved.module.source : `${resolved.module.source}\n`)
      }
      return
    }
    case 'edit': {
      if (moduleReference == null || extra.length > 0 || args.code == null) {
        throw new CliError('cli.invalid-arguments', 'Usage: oo flow code edit <module> --code <javascript|@file|-> [--json]')
      }
      const resolved = exactModule(draft.content.modules, moduleReference)
      const source = await argumentText(args.code, '--code', 'code.source-unreadable', runtime)
      const imports = await moduleImports(source)
      const unchanged =
        source == resolved.module.source &&
        imports.length == resolved.module.imports.length &&
        imports.every((value, index) => value == resolved.module.imports[index])
      if (unchanged) {
        write(
          runtime,
          args.json,
          { changed: false, kind: 'code.edit', moduleId: resolved.moduleId, projectId: project.projectId, revisionId: draft.revisionId, version: 1 },
          `${moduleText(resolved.moduleId, resolved.module)}\t${draft.revisionId}`,
        )
        return
      }
      const target = { kind: 'module', moduleId: resolved.moduleId }
      const changed = await changeDraft(client, project.projectId, draft.revisionId, target, replaceSource(resolved.moduleId, source, imports))
      write(
        runtime,
        args.json,
        { imports, kind: 'code.edit', moduleId: resolved.moduleId, projectId: project.projectId, revision: changed.revision, version: 1 },
        `${resolved.module.name}\t${resolved.moduleId}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'set': {
      if (moduleReference == null || extra.length > 0 || args.name == null) {
        throw new CliError('cli.invalid-arguments', 'Usage: oo flow code set <module> --name <name> [--json]')
      }
      const resolved = exactModule(draft.content.modules, moduleReference)
      const name = args.name.trim()
      if (name.length == 0) throw new CliError('cli.invalid-arguments', 'CodeModule name cannot be empty.')
      if (name == resolved.module.name) {
        write(
          runtime,
          args.json,
          { changed: false, kind: 'code.set', moduleId: resolved.moduleId, projectId: project.projectId, revisionId: draft.revisionId, version: 1 },
          `${moduleText(resolved.moduleId, resolved.module)}\t${draft.revisionId}`,
        )
        return
      }
      const target = { kind: 'module', moduleId: resolved.moduleId }
      const changed = await changeDraft(client, project.projectId, draft.revisionId, target, renameModule(resolved.moduleId, name))
      write(
        runtime,
        args.json,
        { kind: 'code.set', moduleId: resolved.moduleId, name, projectId: project.projectId, revision: changed.revision, version: 1 },
        `${name}\t${resolved.moduleId}\t${changed.revision.revisionId}`,
      )
      return
    }
    default:
      throw new CliError('cli.invalid-arguments', 'Usage: oo flow code <list|show|edit|set> ...')
  }
}

async function edgeCommand(
  client: ControlClient,
  project: Project,
  operation: 'connect' | 'disconnect',
  operands: readonly string[],
  args: ParsedArguments,
  runtime: Runtime,
): Promise<void> {
  requireCount(operands, 5, `oo flow ${operation} <flow> <source> <source-output> <target-node> <target-input> [--json]`)
  const selected = await selectedDraftFlow(client, project.projectId, operands[0]!)
  const source = exactEdgeSource(selected.graph.nodes, operands[1]!)
  if (source.kind == 'trigger' && operands[2] != 'payload') {
    throw new CliError('trigger.output-not-found', 'Trigger output must be payload.')
  }
  const targetNode = exactNode(selected.graph.nodes, operands[3]!)
  const edge = { source: source.id, sourceHandle: operands[2]!, target: targetNode.nodeId, targetHandle: operands[4]! }
  const operations =
    operation == 'connect' ? connectEdge(selected.draft.content, selected.target, edge) : disconnectEdge(selected.draft.content, selected.target, edge)
  const kind = `edge.${operation}` as const
  if (operations.length == 0) {
    write(
      runtime,
      args.json,
      { changed: false, edge, flowId: selected.flow.flowId, kind, projectId: project.projectId, revisionId: selected.draft.revisionId, version: 1 },
      `${operation}\tunchanged\t${source.id}:${edge.sourceHandle}\t${targetNode.nodeId}:${edge.targetHandle}\t${selected.draft.revisionId}`,
    )
    return
  }
  const changeTarget = { edge, flowId: selected.flow.flowId, kind: 'edge' }
  const changed = await changeDraft(client, project.projectId, selected.draft.revisionId, changeTarget, operations)
  write(
    runtime,
    args.json,
    { edge, flowId: selected.flow.flowId, kind, projectId: project.projectId, revision: changed.revision, version: 1 },
    `${operation}\t${source.id}:${edge.sourceHandle}\t${targetNode.nodeId}:${edge.targetHandle}\t${changed.revision.revisionId}`,
  )
}

async function nodeCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, flowReference, nodeReference, ...extra] = operands
  if (flowReference == null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow node <list|show|add|set|remove> <flow> ...')
  const selected = await selectedDraftFlow(client, project.projectId, flowReference)

  switch (operation) {
    case 'list': {
      if (nodeReference != null) throw new CliError('cli.invalid-arguments', 'Usage: oo flow node list <flow> [--json]')
      const entries = Object.entries(selected.graph.nodes).filter((entry): entry is [string, SemanticNode] => 'inputs' in entry[1])
      const nodes = entries.map(([nodeId, node]) => nodeSummary(nodeId, node))
      write(
        runtime,
        args.json,
        {
          flowId: selected.flow.flowId,
          kind: 'node.list',
          nodes,
          projectId: project.projectId,
          revisionId: selected.draft.revisionId,
          version: 1,
        },
        entries.map(([nodeId, node]) => nodeText(nodeId, node)).join('\n'),
      )
      return
    }
    case 'show': {
      if (nodeReference == null || extra.length > 0) throw new CliError('cli.invalid-arguments', 'Usage: oo flow node show <flow> <node> [--json]')
      const resolved = exactNode(selected.graph.nodes, nodeReference)
      write(
        runtime,
        args.json,
        {
          flowId: selected.flow.flowId,
          kind: 'node.show',
          node: nodeDetails(selected.draft.content, resolved.nodeId, resolved.node),
          projectId: project.projectId,
          revisionId: selected.draft.revisionId,
          version: 1,
        },
        nodeText(resolved.nodeId, resolved.node),
      )
      return
    }
    case 'add': {
      if (nodeReference == null || extra.length != 1) {
        throw new CliError(
          'cli.invalid-arguments',
          'Usage: oo flow node add <flow> <code|condition|llm-chat|llm-json|value> <name> [--code <javascript|@file|->] [--json]',
        )
      }
      const name = extra[0]!.trim()
      if (name.length == 0) throw new CliError('cli.invalid-arguments', 'Node name cannot be empty.')
      const nodeId = crypto.randomUUID()
      let identity: { readonly moduleId?: string; readonly taskId?: string } = {}
      let operations
      switch (nodeReference) {
        case 'code': {
          const moduleId = crypto.randomUUID()
          const source = args.code == null ? undefined : await argumentText(args.code, '--code', 'code.source-unreadable', runtime)
          operations = createCodeTask(
            selected.target,
            { moduleId, nodeId },
            name,
            source == null ? undefined : { imports: await moduleImports(source), source },
          )
          identity = { moduleId }
          break
        }
        case 'condition':
          if (args.code != null) throw new CliError('cli.invalid-arguments', '--code is only valid when adding a Code Node.')
          operations = createCondition(selected.target, nodeId, name)
          break
        case 'llm-chat':
        case 'llm-json':
          if (args.code != null) throw new CliError('cli.invalid-arguments', '--code is only valid when adding a Code Node.')
          identity = { taskId: crypto.randomUUID() }
          operations = createLlmTask(
            selected.target,
            { nodeId, taskId: identity.taskId! },
            name,
            nodeReference == 'llm-chat' ? 'chat' : 'json',
            'Generated response.',
          )
          break
        case 'value':
          if (args.code != null) throw new CliError('cli.invalid-arguments', '--code is only valid when adding a Code Node.')
          operations = createValue(selected.target, nodeId, name)
          break
        default:
          throw new CliError('node.kind-invalid', `Unknown Node kind ${JSON.stringify(nodeReference)}.`)
      }
      const target = { flowId: selected.flow.flowId, ...identity, kind: 'node', name, nodeId }
      const changed = await changeDraft(client, project.projectId, selected.draft.revisionId, target, operations)
      write(
        runtime,
        args.json,
        { kind: 'node.add', revision: changed.revision, target, version: 1 },
        `${name}\t${nodeId}\t${nodeReference}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'set': {
      if (nodeReference == null || extra.length > 0) {
        throw new CliError('cli.invalid-arguments', 'Usage: oo flow node set <flow> <node> [--name <name>] [--concurrency <count>] [--timeout <ms>]')
      }
      if (args.name == null && args.concurrency == null && args.timeoutMs == null) {
        throw new CliError('cli.invalid-arguments', 'Node set requires --name, --concurrency, or --timeout.')
      }
      const resolved = exactNode(selected.graph.nodes, nodeReference)
      const name = args.name?.trim()
      if (name != null && name.length == 0) throw new CliError('cli.invalid-arguments', 'Node name cannot be empty.')
      const nextName = name ?? resolved.node.name
      const nextTimeoutMs = args.timeoutMs ?? resolved.node.timeoutMs
      const settings = {
        concurrency: args.concurrency ?? resolved.node.concurrency,
        ...(nextName == null ? {} : { name: nextName }),
        ...(nextTimeoutMs == null ? {} : { timeoutMs: nextTimeoutMs }),
      }
      if (settings.concurrency == resolved.node.concurrency && settings.name == resolved.node.name && settings.timeoutMs == resolved.node.timeoutMs) {
        write(
          runtime,
          args.json,
          {
            changed: false,
            flowId: selected.flow.flowId,
            kind: 'node.set',
            node: nodeDetails(selected.draft.content, resolved.nodeId, resolved.node),
            projectId: project.projectId,
            revisionId: selected.draft.revisionId,
            version: 1,
          },
          `${nodeText(resolved.nodeId, resolved.node)}\t${selected.draft.revisionId}`,
        )
        return
      }
      const operations = updateSettings(selected.draft.content, selected.target, resolved.nodeId, settings)!
      const target = { flowId: selected.flow.flowId, kind: 'node', nodeId: resolved.nodeId }
      const changed = await changeDraft(client, project.projectId, selected.draft.revisionId, target, operations)
      write(
        runtime,
        args.json,
        { kind: 'node.set', revision: changed.revision, target, version: 1 },
        `${name ?? resolved.node.name ?? '<unnamed>'}\t${resolved.nodeId}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'remove': {
      if (nodeReference == null || extra.length > 0) throw new CliError('cli.invalid-arguments', 'Usage: oo flow node remove <flow> <node> --yes [--json]')
      if (!args.yes) throw new CliError('node.confirmation-required', 'Node removal requires --yes.')
      const resolved = exactNode(selected.graph.nodes, nodeReference)
      const target = { flowId: selected.flow.flowId, kind: 'node', nodeId: resolved.nodeId }
      const changed = await changeDraft(
        client,
        project.projectId,
        selected.draft.revisionId,
        target,
        deleteNodes(selected.draft.content, selected.target, [resolved.nodeId]),
      )
      write(
        runtime,
        args.json,
        { kind: 'node.remove', revision: changed.revision, target, version: 1 },
        `${resolved.node.name ?? '<unnamed>'}\t${resolved.nodeId}\t${changed.revision.revisionId}`,
      )
      return
    }
    default:
      throw new CliError('cli.invalid-arguments', 'Usage: oo flow node <list|show|add|set|remove> <flow> ...')
  }
}

async function inspectFlowCommand(
  client: ControlClient,
  project: Project,
  operands: readonly string[],
  args: ParsedArguments,
  runtime: Runtime,
): Promise<void> {
  requireCount(operands, 1, 'oo flow inspect <flow> [--summary] [--project <project>] [--json]')
  const selected = await selectedDraftFlow(client, project.projectId, operands[0]!)
  const check = await client.checkFlow(project.projectId, selected.draft.revisionId, selected.flow.flowId)
  const nodeEntries = Object.entries(selected.graph.nodes).filter((entry): entry is [string, SemanticNode] => 'inputs' in entry[1])
  const nodeSummaries = nodeEntries.map(([nodeId, node]) => inspectedNodeSummary(selected.draft.content, nodeId, node))
  const nodes = args.summary ? nodeSummaries : nodeEntries.map(([nodeId, node]) => inspectedNode(selected.draft.content, nodeId, node))
  const triggerEntries = Object.entries(selected.graph.nodes)
    .filter((entry): entry is [string, TriggerNode] => !('inputs' in entry[1]))
    .map(([triggerId, trigger]) => ({ trigger, triggerId }))
  const triggers = args.summary
    ? triggerEntries.map(({ trigger, triggerId }) => inspectedTriggerSummary(selected.draft.content, triggerId, trigger))
    : triggerEntries.map(({ trigger, triggerId }) => {
        const binding = trigger.kind == 'poll' || trigger.kind == 'integration' ? selected.draft.content.document.bindings[trigger.bindingId] : undefined
        return binding == null ? { trigger, triggerId } : { binding, trigger, triggerId }
      })
  const { content: _content, ...revision } = selected.draft
  const result = {
    check,
    edges: inspectedEdges(selected.graph.nodes),
    flow: selected.flow,
    kind: 'flow.inspect',
    nodes,
    project,
    revision,
    ...(args.summary ? { summary: true } : {}),
    triggers,
    version: 1,
  }
  const lines = [
    `${check.valid ? 'valid' : 'invalid'}\t${selected.flow.draft!.name}\t${selected.flow.flowId}\t${selected.draft.revisionId}`,
    ...nodeSummaries.map((entry) => `node\t${entry.kind}\t${entry.name ?? '<unnamed>'}\t${entry.nodeId}`),
    ...result.edges.map((edge) =>
      edge.source.kind == 'node'
        ? `edge\t${edge.source.nodeId}:${edge.source.output}\t${edge.target.nodeId}:${edge.input}`
        : edge.source.kind == 'binding'
          ? `binding-edge\t${edge.source.bindingId}\t${edge.target.nodeId}:${edge.input}`
          : `flow-edge\t${edge.source.input}\t${edge.target.nodeId}:${edge.input}`,
    ),
  ]
  write(runtime, args.json, result, lines.join('\n'))
}

async function applyFlowCommand(client: ControlClient, project: Project, operands: readonly string[], args: ParsedArguments, runtime: Runtime): Promise<void> {
  requireCount(operands, 1, 'oo flow apply <flow> --file <path|-> [--expected-revision <revision>] [--project <project>] [--json]')
  if (args.file == null) {
    throw new CliError('cli.invalid-arguments', 'Usage: oo flow apply <flow> --file <path|-> [--expected-revision <revision>] [--project <project>] [--json]')
  }
  const selected = await selectedDraftFlow(client, project.projectId, operands[0]!)
  if (args.expectedRevision != null && args.expectedRevision != selected.draft.revisionId) {
    throw new CliError('project.revision-conflict', 'The selected Flow Draft changed after it was inspected.', {
      actualRevisionId: selected.draft.revisionId,
      expectedRevisionId: args.expectedRevision,
      flowId: selected.flow.flowId,
      projectId: project.projectId,
    })
  }
  let source: string
  try {
    source = args.file == '-' ? await runtime.readStdin() : await runtime.readFile(args.file.startsWith('@') ? args.file.slice(1) : args.file)
  } catch (error) {
    throw new CliError('flow.apply-unreadable', error instanceof Error ? error.message : String(error))
  }
  const spec = applySpec(source)
  const actionRequests = new Map<string, Promise<ConnectorAction>>()
  const triggerRequests = new Map<string, Promise<TriggerKeySnapshot>>()
  for (const node of Object.values(spec.nodes)) {
    if (node.kind == 'connector' && !actionRequests.has(node.action)) {
      actionRequests.set(node.action, referencedAction(client, project.projectId, node.action))
    }
  }
  for (const trigger of Object.values(spec.triggers)) {
    if (trigger.kind == 'provider' && !triggerRequests.has(trigger.key)) {
      triggerRequests.set(trigger.key, referencedTriggerKey(client, trigger.key))
    }
  }
  const preparedNodes = await Promise.all(
    Object.entries(spec.nodes).map(async ([reference, node]) => {
      const nodeId = crypto.randomUUID()
      switch (node.kind) {
        case 'code': {
          if (args.file == '-' && node.code == '-') {
            throw new CliError('flow.apply-invalid', 'A Flow apply request read from stdin cannot also read Code source from stdin.')
          }
          const code = await argumentText(node.code, 'nodes.code', 'code.source-unreadable', runtime)
          const identity = { moduleId: crypto.randomUUID(), nodeId }
          return {
            identity: { kind: node.kind, moduleId: identity.moduleId, name: node.name, nodeId, reference },
            operations: createCodeTask(
              selected.target,
              identity,
              node.name,
              { imports: await moduleImports(code), source: code },
              {
                inputs: node.inputs ?? { value: { jsonSchema: {}, nullable: true, value: null } },
                outputs: node.outputs ?? { result: { jsonSchema: {}, nullable: true } },
              },
            ),
          }
        }
        case 'connector': {
          const action = await actionRequests.get(node.action)!
          const connection = await preferredConnection(client, project.projectId, action.serviceId, node.connection, action.defaultConnection, false)
          const identity = { nodeId, taskId: crypto.randomUUID() }
          const name = node.name ?? action.name
          return {
            identity: {
              actionId: action.actionId,
              ...(connection == null ? {} : { connection }),
              ...(connection == null ? {} : { connectionId: connection.connectionId }),
              kind: node.kind,
              name,
              nodeId,
              reference,
              taskId: identity.taskId,
            },
            operations: createManagedTask(selected.target, identity, {
              executor: {
                action: action.actionId,
                ...(connection == null ? {} : { connectionId: connection.connectionId }),
                kind: 'connector',
              },
              inputs: withInputValues(action, node.inputs),
              name,
              outputs: action.outputs,
            }),
          }
        }
        case 'condition':
          return {
            identity: { kind: node.kind, name: node.name, nodeId, reference },
            operations: createCondition(selected.target, nodeId, node.name),
          }
        case 'llm-chat':
        case 'llm-json': {
          const taskId = crypto.randomUUID()
          return {
            identity: { kind: node.kind, name: node.name, nodeId, reference, taskId },
            operations: createLlmTask(selected.target, { nodeId, taskId }, node.name, node.kind == 'llm-chat' ? 'chat' : 'json', 'Generated response.', {
              inputs: node.inputs,
              output: node.output,
            }),
          }
        }
        case 'value':
          return {
            identity: { kind: node.kind, name: node.name, nodeId, reference },
            operations: createValue(selected.target, nodeId, node.name),
          }
      }
    }),
  )
  const preparedTriggers = await Promise.all(
    Object.entries(spec.triggers).map(async ([reference, trigger]) => {
      const triggerId = crypto.randomUUID()
      switch (trigger.kind) {
        case 'webhook': {
          const name = trigger.name ?? 'Webhook'
          return {
            identity: { kind: trigger.kind, name, reference, triggerId },
            operations: createBuiltinTrigger(selected.target, triggerId, { inputsDef: [], kind: trigger.kind, name }),
          }
        }
        case 'cron': {
          const name = trigger.name ?? 'Scheduled Trigger'
          return {
            identity: { kind: trigger.kind, name, reference, triggerId },
            operations: createBuiltinTrigger(selected.target, triggerId, {
              cronTimes: trigger.schedule ?? [{ type: 'every', unit: 'hour', value: 1 }],
              kind: trigger.kind,
              name,
            }),
          }
        }
        case 'provider': {
          const definition = await triggerRequests.get(trigger.key)!
          const connection = await preferredConnection(client, project.projectId, definition.provider, trigger.connection, undefined, true)
          const name = trigger.name ?? definition.displayName
          return {
            identity: {
              connection,
              connectionId: connection!.connectionId,
              key: definition.key,
              kind: trigger.kind,
              name,
              reference,
              triggerId,
              triggerKind: definition.type,
            },
            operations: createProviderTrigger(selected.target, { bindingId: crypto.randomUUID(), nodeId: triggerId }, definition, {
              config: trigger.config,
              connectionId: connection!.connectionId,
              name,
              ...(trigger.schedule == null ? {} : { schedule: trigger.schedule }),
            }),
          }
        }
      }
    }),
  )
  const nodeIdentities = preparedNodes.map((node) => node.identity)
  const triggerIdentities = preparedTriggers.map((trigger) => trigger.identity)
  const operations = [...preparedNodes.flatMap((node) => node.operations), ...preparedTriggers.flatMap((trigger) => trigger.operations)]
  let content = operations.length == 0 ? selected.draft.content : applyProjectChanges(selected.draft.content, operations)
  const nodeReferences = new Map(nodeIdentities.map((identity) => [identity.reference, identity.nodeId]))
  const triggerReferences = new Map(triggerIdentities.map((identity) => [identity.reference, identity.triggerId]))
  const edges = []
  for (const requested of spec.edges) {
    const graph = content.document.flows[selected.flow.flowId]!.graph
    const localNodeId = nodeReferences.get(requested.source)
    const localTriggerId = triggerReferences.get(requested.source)
    let resolvedSource: ReturnType<typeof exactEdgeSource>
    if (localNodeId != null) resolvedSource = { id: localNodeId, kind: 'node' }
    else if (localTriggerId != null) resolvedSource = { id: localTriggerId, kind: 'trigger' }
    else resolvedSource = exactEdgeSource(graph.nodes, requested.source)
    if (resolvedSource.kind == 'trigger' && requested.output != 'payload') {
      throw new CliError('trigger.output-not-found', 'Trigger output must be payload.')
    }
    const targetNodeId = nodeReferences.get(requested.target) ?? exactNode(graph.nodes, requested.target).nodeId
    const edge = {
      source: resolvedSource.id,
      sourceHandle: requested.output,
      target: targetNodeId,
      targetHandle: requested.input,
    }
    const edgeOperations = connectEdge(content, selected.target, edge)
    operations.push(...edgeOperations)
    if (edgeOperations.length > 0) content = applyProjectChanges(content, edgeOperations)
    edges.push({ ...edge, sourceReference: requested.source, targetReference: requested.target })
  }
  if (operations.length == 0) {
    const check = await client.checkFlow(project.projectId, selected.draft.revisionId, selected.flow.flowId)
    write(
      runtime,
      args.json,
      {
        changed: false,
        check,
        edges,
        flowId: selected.flow.flowId,
        kind: 'flow.apply',
        nodes: nodeIdentities,
        projectId: project.projectId,
        revisionId: selected.draft.revisionId,
        triggers: triggerIdentities,
        version: 1,
      },
      `unchanged\t${selected.flow.draft!.name}\t${selected.draft.revisionId}\t${check.valid ? 'valid' : 'invalid'}`,
    )
    return
  }
  const target = {
    flowId: selected.flow.flowId,
    kind: 'flow.apply',
    references: [...nodeIdentities.map((identity) => identity.reference), ...triggerIdentities.map((identity) => identity.reference)],
  }
  const changed = await changeDraft(client, project.projectId, selected.draft.revisionId, target, operations)
  let check
  try {
    check = await client.checkFlow(project.projectId, changed.revision.revisionId, selected.flow.flowId)
  } catch (error) {
    write(
      runtime,
      args.json,
      {
        check: { status: 'unavailable' },
        edges,
        flowId: selected.flow.flowId,
        kind: 'flow.apply',
        nodes: nodeIdentities,
        projectId: project.projectId,
        revision: changed.revision,
        triggers: triggerIdentities,
        version: 1,
      },
      `applied\t${selected.flow.draft!.name}\t${changed.revision.revisionId}\tcheck-unavailable\t${preparedNodes.length} nodes\t${preparedTriggers.length} triggers\t${edges.length} edges`,
    )
    throw new CliError('flow.apply-check-failed', 'The Flow apply change was accepted, but the resulting Draft could not be checked. Do not retry the apply.', {
      checkError:
        error instanceof ApiError ? { code: error.code, message: error.message } : { message: error instanceof Error ? error.message : String(error) },
      revisionId: changed.revision.revisionId,
    })
  }
  write(
    runtime,
    args.json,
    {
      check,
      edges,
      flowId: selected.flow.flowId,
      kind: 'flow.apply',
      nodes: nodeIdentities,
      projectId: project.projectId,
      revision: changed.revision,
      triggers: triggerIdentities,
      version: 1,
    },
    `applied\t${selected.flow.draft!.name}\t${changed.revision.revisionId}\t${check.valid ? 'valid' : 'invalid'}\t${preparedNodes.length} nodes\t${preparedTriggers.length} triggers\t${edges.length} edges`,
  )
  if (!check.valid) {
    throw new CliError('flow.invalid', 'The Flow apply change was accepted, but the resulting Draft has diagnostics.', {
      diagnostics: check.diagnostics,
      revisionId: changed.revision.revisionId,
    })
  }
}

async function flowCommand(client: ControlClient, host: CommandHost, args: ParsedArguments, runtime: Runtime): Promise<void> {
  const [operation, ...operands] = args.positionals
  const project = await currentProject(client, host, args, runtime)

  switch (operation) {
    case 'apply':
      return await applyFlowCommand(client, project, operands, args, runtime)
    case 'code':
      return await codeCommand(client, project, operands, args, runtime)
    case 'connector':
      return await connectorCommand(client, project, operands, args, runtime)
    case 'connect':
    case 'disconnect':
      return await edgeCommand(client, project, operation, operands, args, runtime)
    case 'node':
      return await nodeCommand(client, project, operands, args, runtime)
    case 'inspect':
      return await inspectFlowCommand(client, project, operands, args, runtime)
    case 'run':
      return await createRunCommand(client, project, operands, args, runtime)
    case 'runs':
      return await runsCommand(client, project, operands, args, runtime)
    case 'publish':
      return await publishCommand(client, project, operands, args, runtime)
    case 'publications':
      return await publicationsCommand(client, project, operands, args, runtime)
    case 'rollback':
      return await rollbackCommand(client, project, operands, args, runtime)
    case 'trigger':
      return await triggerCommand(client, project, operands, args, runtime)
    case 'open':
    case 'workbench': {
      if (operands.length > 1) throw new CliError('cli.invalid-arguments', `Usage: oo flow ${operation} [flow] [--project <project>] [--json]`)
      if (host.getWorkbenchUrl == null) throw new CliError('workbench.unavailable', 'This CLI host cannot provide a Workbench URL.')
      const flow = operands[0] == null ? undefined : exactFlow(await client.listFlows(project.projectId), operands[0]!)
      const url = await host.getWorkbenchUrl(project.projectId, flow?.flowId)
      if (operation == 'open') await runtime.openUrl(url)
      write(runtime, args.json, { ...(flow == null ? {} : { flow }), kind: `flow.${operation}`, project, url, version: 1 }, url)
      return
    }
    case 'list': {
      requireCount(operands, 0, 'oo flow list [--project <project>] [--json]')
      const flows = await client.listFlows(project.projectId)
      write(runtime, args.json, { flows, kind: 'flow.list', project, version: 1 }, flows.map(flowText).join('\n'))
      return
    }
    case 'create': {
      requireCount(operands, 1, 'oo flow create <name> [--project <project>] [--json]')
      const name = checkedResourceName(operands[0]!, 'Flow')
      const flows = await client.listFlows(project.projectId)
      if (flows.some((flow) => flow.draft?.name == name)) throw new CliError('flow.conflict', `Draft Flow ${JSON.stringify(name)} already exists.`)
      const flowId = crypto.randomUUID()
      const target = { flowId, kind: 'flow', name }
      const changed = await changeDraft(client, project.projectId, project.draftRevisionId, target, createFlow(flowId, name))
      write(runtime, args.json, { kind: 'flow.create', revision: changed.revision, target, version: 1 }, `${name}\t${flowId}\t${changed.revision.revisionId}`)
      return
    }
    case 'show': {
      requireCount(operands, 1, 'oo flow show <flow> [--project <project>] [--json]')
      const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!)
      write(runtime, args.json, { flow, kind: 'flow.show', project, version: 1 }, flowText(flow))
      return
    }
    case 'rename': {
      requireCount(operands, 2, 'oo flow rename <flow> <new-name> [--project <project>] [--json]')
      const flows = await client.listFlows(project.projectId)
      const flow = exactFlow(flows, operands[0]!, true)
      const name = checkedResourceName(operands[1]!, 'Flow')
      if (flows.some((candidate) => candidate.flowId != flow.flowId && candidate.draft?.name == name)) {
        throw new CliError('flow.conflict', `Draft Flow ${JSON.stringify(name)} already exists.`)
      }
      const target = { flowId: flow.flowId, kind: 'flow', name }
      const changed = await changeDraft(client, project.projectId, flow.draft!.revisionId, target, renameFlow(flow.flowId, name))
      write(
        runtime,
        args.json,
        { kind: 'flow.rename', revision: changed.revision, target, version: 1 },
        `${name}\t${flow.flowId}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'delete': {
      requireCount(operands, 1, 'oo flow delete <flow> --yes [--project <project>] [--json]')
      if (!args.yes) throw new CliError('flow.confirmation-required', 'Flow deletion requires --yes.')
      const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!, true)
      const target = { flowId: flow.flowId, kind: 'flow', name: flow.draft!.name }
      const changed = await changeDraft(client, project.projectId, flow.draft!.revisionId, target, deleteFlow(flow.flowId))
      write(
        runtime,
        args.json,
        { kind: 'flow.delete', revision: changed.revision, target, version: 1 },
        `${target.name}\t${flow.flowId}\t${changed.revision.revisionId}`,
      )
      return
    }
    case 'check': {
      requireCount(operands, 1, 'oo flow check <flow> [--project <project>] [--json]')
      const flow = exactFlow(await client.listFlows(project.projectId), operands[0]!, true)
      const check = await client.checkFlow(project.projectId, flow.draft!.revisionId, flow.flowId)
      write(
        runtime,
        args.json,
        { check, kind: 'flow.check', scope: 'revision', version: 1 },
        `${check.valid ? 'valid' : 'invalid'}\trevision\t${flow.draft!.name}\t${flow.flowId}`,
      )
      if (!check.valid) throw new CliError('flow.invalid', 'The Flow has diagnostics.', { diagnostics: check.diagnostics })
      return
    }
    default:
      throw new CliError(
        'cli.invalid-arguments',
        'Usage: oo flow <list|create|show|inspect|apply|rename|delete|check|node|connect|disconnect|code|connector|trigger|run|runs|publish|publications|rollback|workbench>',
      )
  }
}

interface Choice {
  readonly label: string
  readonly value: string
}

async function choose(runtime: Runtime, title: string, choices: readonly Choice[]): Promise<string> {
  runtime.stdout.write(`\n${title}\n`)
  choices.forEach((choice, index) => runtime.stdout.write(`  ${index + 1}. ${choice.label}\n`))
  while (true) {
    const value = Number((await runtime.question(localized(runtime.language, 'Choose: ', '请选择：'))).trim())
    if (Number.isSafeInteger(value) && value > 0 && value <= choices.length) return choices[value - 1]!.value
    runtime.stderr.write(`${localized(runtime.language, 'Enter one of the listed numbers.', '请输入列表中的数字。')}\n`)
  }
}

async function promptName(runtime: Runtime, english: string, chinese: string): Promise<string | undefined> {
  const value = (await runtime.question(`${localized(runtime.language, english, chinese)}: `)).trim()
  return value.length == 0 ? undefined : value
}

async function interactive(client: ControlClient, host: CommandHost, runtime: Runtime): Promise<void> {
  let projectId: string | undefined
  let flowId: string | undefined
  const preferredProject = runtime.env.OO_FLOW_PROJECT ?? (await host.getProject())

  if (preferredProject != null) {
    const projects = await allProjects(client)
    const byId = projects.find((project) => project.projectId == preferredProject)
    const byName = projects.filter((project) => project.name == preferredProject)
    projectId = byId?.projectId ?? (byName.length == 1 ? byName[0]!.projectId : undefined)
  }

  while (true) {
    if (projectId == null) {
      const projects = await allProjects(client)
      const selected = await choose(runtime, localized(runtime.language, 'Projects', '项目'), [
        ...projects.map((project) => ({ label: project.name, value: project.projectId })),
        { label: localized(runtime.language, 'Create Project', '创建项目'), value: 'create' },
        { label: localized(runtime.language, 'Quit', '退出'), value: 'quit' },
      ])
      if (selected == 'quit') return
      if (selected == 'create') {
        const projectName = await promptName(runtime, 'Project name', '项目名称')
        if (projectName == null) continue
        const before = new Set(projects.map((project) => project.projectId))
        if ((await runCli(['project', 'create', projectName], host, runtime)) == 0) {
          const created = (await allProjects(client)).filter((project) => !before.has(project.projectId))
          if (created.length == 1) projectId = created[0]!.projectId
        }
        continue
      }
      projectId = selected
      continue
    }

    if (flowId == null) {
      const flows = (await client.listFlows(projectId)).filter((flow) => flow.draft != null)
      const selected = await choose(runtime, localized(runtime.language, 'Flows', 'Flow'), [
        ...flows.map((flow) => ({ label: flow.draft!.name, value: flow.flowId })),
        { label: localized(runtime.language, 'Create Flow', '创建 Flow'), value: 'create' },
        { label: localized(runtime.language, 'Choose another Project', '切换项目'), value: 'project' },
        { label: localized(runtime.language, 'Quit', '退出'), value: 'quit' },
      ])
      if (selected == 'quit') return
      if (selected == 'project') {
        projectId = undefined
        continue
      }
      if (selected == 'create') {
        const flowName = await promptName(runtime, 'Flow name', 'Flow 名称')
        if (flowName == null) continue
        const before = new Set(flows.map((flow) => flow.flowId))
        if ((await runCli(['create', flowName, '--project', projectId], host, runtime)) == 0) {
          const created = (await client.listFlows(projectId)).filter((flow) => flow.draft != null && !before.has(flow.flowId))
          if (created.length == 1) flowId = created[0]!.flowId
        }
        continue
      }
      flowId = selected
      continue
    }

    const action = await choose(runtime, localized(runtime.language, 'Actions', '操作'), [
      { label: localized(runtime.language, 'View', '查看'), value: 'show' },
      { label: localized(runtime.language, 'Rename', '重命名'), value: 'rename' },
      { label: localized(runtime.language, 'Check', '检查'), value: 'check' },
      { label: localized(runtime.language, 'Run Draft', '运行草稿'), value: 'run' },
      { label: localized(runtime.language, 'Publish', '发布'), value: 'publish' },
      { label: localized(runtime.language, 'Open Workbench', '打开 Workbench'), value: 'open' },
      { label: localized(runtime.language, 'Choose another Flow', '切换 Flow'), value: 'flow' },
      { label: localized(runtime.language, 'Choose another Project', '切换项目'), value: 'project' },
      { label: localized(runtime.language, 'Quit', '退出'), value: 'quit' },
    ])
    if (action == 'quit') return
    if (action == 'flow') {
      flowId = undefined
      continue
    }
    if (action == 'project') {
      projectId = undefined
      flowId = undefined
      continue
    }
    if (action == 'rename') {
      const nextName = await promptName(runtime, 'New Flow name', '新的 Flow 名称')
      if (nextName != null) await runCli(['rename', flowId, nextName, '--project', projectId], host, runtime)
      continue
    }
    await runCli([action, flowId, '--project', projectId], host, runtime)
  }
}

function help(runtime: Runtime): string {
  return localized(
    runtime.language,
    [
      'Open Flow commands',
      '',
      '  oo flow project <list|create|show|use|current>',
      '  oo flow list',
      '  oo flow create <name>',
      '  oo flow show <flow>',
      '  oo flow inspect <flow> [--summary]',
      '  oo flow apply <flow> --file <path|-> [--expected-revision <revision>]',
      '  oo flow rename <flow> <new-name>',
      '  oo flow delete <flow> --yes',
      '  oo flow check <flow>',
      '  oo flow node <list|show|add|set|remove> <flow>',
      '  oo flow node add <flow> code <name> [--code <javascript|@file|->]',
      '  oo flow connect <flow> <source> <source-output> <target-node> <target-input>',
      '  oo flow disconnect <flow> <source> <source-output> <target-node> <target-input>',
      '  oo flow code <list|show|edit|set>',
      '  oo flow connector <list|search|show|connections|add|set>',
      '  oo flow trigger <search|show|list|add|set|remove>',
      '  oo flow run <flow> [--source draft|live] [--input <json|@file|->] [--wait]',
      '  oo flow runs <list|show|events|result|cancel>',
      '  oo flow publish <flow>',
      '  oo flow publications <list|show> <flow>',
      '  oo flow rollback <flow> <publication>',
      '  oo flow open [flow]',
      '  oo flow workbench [flow]',
      '',
      'Options: --project <project>, --json, --cursor <cursor>, --limit <count>',
    ].join('\n'),
    [
      'Open Flow 命令',
      '',
      '  oo flow project <list|create|show|use|current>',
      '  oo flow <list|create|show|inspect|apply|rename|delete|check|node|connect|disconnect|code|connector|trigger|run|runs|publish|publications|rollback|open|workbench>',
      '',
      '选项：--project <project>、--json、--cursor <cursor>、--limit <count>',
    ].join('\n'),
  )
}

export async function runCli(args: readonly string[], host: CommandHost, runtime: Runtime): Promise<number> {
  let parsed: ParsedArguments | undefined
  try {
    if (args.length == 0 && runtime.interactive) {
      await interactive(new ControlClient(host.request), host, runtime)
      return 0
    }
    if (args.length == 0 || args.includes('--help') || args.includes('-h')) {
      runtime.stdout.write(`${help(runtime)}\n`)
      return 0
    }
    parsed = parseArguments(args)
    const client = new ControlClient(host.request)
    if (parsed.positionals[0] == 'project') await projectCommand(client, host, parsed, runtime)
    else await flowCommand(client, host, parsed, runtime)
    return 0
  } catch (error) {
    let value: CliError
    if (error instanceof CliError) value = error
    else if (error instanceof ApiError) value = cloudError(error)
    else value = new CliError('flow.unexpected', error instanceof Error ? error.message : String(error))
    if (parsed?.json == true) {
      runtime.stderr.write(
        `${JSON.stringify({ error: { code: value.code, ...(value.details == null ? {} : { details: value.details }), message: value.message }, version: 1 })}\n`,
      )
    } else {
      runtime.stderr.write(`${value.code}: ${value.message}\n`)
    }
    return 1
  }
}
