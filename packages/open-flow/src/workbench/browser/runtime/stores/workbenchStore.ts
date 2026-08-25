import type { I18n } from 'val-i18n'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { WorkbenchClient, Draft, Run, RunEvent } from '../api.ts'
import type { ProjectChangeEvent, WorkbenchHost, WorkbenchPreferences } from '../contract.ts'
import type { AddNodeOption } from '../designer/addNodeOptions.ts'
import type { DesignerTarget } from '../designer/projectChanges.ts'
import type { DesignerEdge, DesignerNode, DesignerGraph, Point } from '../workspace.ts'
import type { Notice } from './workbenchNotice.ts'
import type { WorkspaceBusy } from './workspaceModel.ts'

import { compute, derive, val } from 'value-enhancer'
import { createI18n } from '../i18n.ts'
import { PublicationStore } from '../publications/publicationStore.ts'
import { revisionView } from '../revisionView.ts'
import { RunRequestStore } from '../runs/runRequestStore.ts'
import { RunStore } from '../runs/runStore.ts'
import { designerGraph, targetPresentation } from '../workspace.ts'
import { ConnectorStore } from './connectorStore.ts'
import { Latest } from './latest.ts'
import { TriggerStore } from './triggerStore.ts'
import { errorNotice } from './workbenchNotice.ts'
import { WorkspaceStore } from './workspaceStore.ts'

export type Busy = WorkspaceBusy | 'cancel' | 'publish' | 'rollback' | 'run' | 'trigger'

export interface Workbench$ {
  readonly busy: ReadonlyVal<Busy | undefined>
  readonly designer: ReadonlyVal<DesignerGraph>
  readonly designerNodeById: ReadonlyVal<ReadonlyMap<string, DesignerNode>>
  readonly notice: ReadonlyVal<Notice | undefined>
  readonly runEventNodes: ReadonlyVal<ReadonlyMap<number, string>>
  readonly selectedDesignerNode: ReadonlyVal<DesignerNode | undefined>
}

function indexNodes(designer: DesignerGraph): ReadonlyMap<string, DesignerNode> {
  return new Map(designer.nodes.map((node) => [node.id, node]))
}

function designerRevisionInputs(draft: Draft | undefined, target: DesignerTarget | undefined): readonly unknown[] {
  return draft == null || target == null ? [] : revisionView(draft).designerInputs(target)
}

function indexRunEventNodes(
  draft: Draft | undefined,
  target: DesignerTarget | undefined,
  run: Run | undefined,
  events: readonly RunEvent[],
  nodes: ReadonlyMap<string, DesignerNode>,
): ReadonlyMap<number, string> {
  if (draft == null || target?.kind != 'flow' || run?.revisionId != draft.revisionId || run.flowId != target.id) return new Map()
  const scopeId = events.find((event) => event.kind == 'run.started' && event.payload.flowId == target.id)?.payload.scopeId
  if (typeof scopeId != 'string') return new Map()
  return new Map(
    events.flatMap((event) => {
      const nodeId = event.payload.nodeId
      return event.payload.scopeId == scopeId && event.payload.flowId == target.id && typeof nodeId == 'string' && nodes.has(nodeId)
        ? [[event.sequence, nodeId] as const]
        : []
    }),
  )
}

const blockedExternalPages: Pick<WorkbenchHost, 'openExternalPage' | 'returnUrl'> = {
  openExternalPage: async () => false,
  returnUrl: '',
}

export class WorkbenchStore {
  readonly #externalRuns = new Latest()
  readonly #i18n: I18n
  readonly #notice: Val<Notice | undefined> = val()
  #disposed = false

  public readonly $: Workbench$
  public readonly connectors: ConnectorStore
  public readonly publications: PublicationStore
  public readonly runRequests: RunRequestStore
  public readonly runs: RunStore
  public readonly triggers: TriggerStore
  public readonly workspace: WorkspaceStore

  public constructor(
    client: WorkbenchClient,
    _preferences: WorkbenchPreferences,
    identity: () => string = () => crypto.randomUUID(),
    i18n: I18n = createI18n(),
    host: Pick<WorkbenchHost, 'openExternalPage' | 'returnUrl'> = blockedExternalPages,
  ) {
    this.#i18n = i18n
    const setNotice = (notice: Notice | undefined): void => {
      if (!this.#disposed) this.#notice.set(notice)
    }
    this.runs = new RunStore(client, setNotice, i18n)
    this.workspace = new WorkspaceStore(client, setNotice, identity, i18n, (event) => void this.#followExternalRun(client, event))
    this.connectors = new ConnectorStore(client, this.workspace, setNotice, host, i18n)
    this.triggers = new TriggerStore(client, this.workspace, setNotice, host, i18n)
    this.publications = new PublicationStore(client, this.workspace, setNotice, identity, i18n)
    this.runRequests = new RunRequestStore(client, this.runs, setNotice, i18n, identity)
    const designerCache = new Map<string, { readonly graph: DesignerGraph; readonly inputs: readonly unknown[] }>()
    let designerProjectId: string | undefined
    const designer = compute((get) => {
      const draft = get(this.workspace.$.draft)
      if (designerProjectId != draft?.projectId) {
        designerCache.clear()
        designerProjectId = draft?.projectId
      }
      const target = get(this.workspace.$.target)
      const presentation = get(this.workspace.$.presentation)?.value
      const diagnostics = get(this.workspace.$.diagnostics)?.diagnostics
      const actions = get(this.connectors.$.actions)
      const catalogs = get(this.connectors.$.catalogs)
      const t = get(i18n.t$)
      const run = get(this.runs.$.run)
      const events = get(this.runs.$.events)
      const key = target == null ? '' : `${target.kind}:${target.id}`
      const inputs = [
        ...designerRevisionInputs(draft, target),
        presentation == null || target == null ? undefined : targetPresentation(presentation, target),
        diagnostics,
        actions,
        catalogs,
        t,
        run,
        events,
        ...(run == null ? [] : [draft?.revisionId]),
      ]
      const cached = designerCache.get(key)
      if (cached != null && cached.inputs.length == inputs.length && cached.inputs.every((input, index) => input === inputs[index])) return cached.graph
      const graph = designerGraph(draft, target, presentation, diagnostics, actions, catalogs, t, run, events)
      designerCache.set(key, { graph, inputs })
      return graph
    })
    const designerNodeById = derive(designer, indexNodes)
    this.$ = {
      busy: compute((get) => {
        const workspaceBusy = get(this.workspace.$.busy)
        if (workspaceBusy != null) return workspaceBusy
        if (get(this.runRequests.$.starting)) return 'run'
        if (get(this.runs.$.cancelingRunId) != null) return 'cancel'
        if (get(this.publications.$.publishing)) return 'publish'
        if (get(this.publications.$.rollingBackPublicationId) != null) return 'rollback'
        if (get(this.publications.$.changingTriggerId) != null) return 'trigger'
      }),
      designer,
      designerNodeById,
      notice: this.#notice,
      runEventNodes: compute((get) =>
        indexRunEventNodes(get(this.workspace.$.draft), get(this.workspace.$.target), get(this.runs.$.run), get(this.runs.$.events), get(designerNodeById)),
      ),
      selectedDesignerNode: compute((get) => {
        const selected = get(this.workspace.$.selectedNodeIds)
        return selected.length == 1 ? get(designerNodeById).get(selected[0]!) : undefined
      }),
    }
  }

  public dispose(): void {
    this.#disposed = true
    this.#externalRuns.invalidate()
    for (const value of Object.values(this.$)) value.dispose()
    this.connectors.dispose()
    this.publications.dispose()
    this.runRequests.dispose()
    this.runs.dispose()
    this.triggers.dispose()
    this.workspace.dispose()
  }

  public async start(projectId?: string, flowId?: string): Promise<void> {
    this.#externalRuns.invalidate()
    this.connectors.reset()
    this.triggers.reset()
    this.publications.reset()
    this.runRequests.reset()
    this.runs.reset()
    await this.workspace.start(projectId, flowId)
  }

  public async retryProjects(): Promise<void> {
    await this.workspace.reloadProjects()
  }

  public dismissNotice(): void {
    if (!this.#disposed) this.#notice.set(undefined)
  }

  public async selectProject(projectId: string | undefined, flowId?: string): Promise<boolean> {
    if (this.#disposed) return false
    this.#externalRuns.invalidate()
    this.#notice.set(undefined)
    if (!(await this.workspace.selectProject(projectId, flowId))) return false
    this.connectors.reset()
    this.triggers.reset()
    this.publications.reset()
    this.runRequests.reset()
    this.runs.reset()
    return true
  }

  public async createProject(name: string): Promise<boolean> {
    const project = await this.workspace.createProject(name)
    if (this.#disposed || project == null) return false
    await this.selectProject(project.projectId)
    if (!this.#disposed) this.#notice.set({ kind: 'success', message: this.#i18n.t('notice.created', { name: project.name }) })
    return true
  }

  public selectNodes(nodeIds: readonly string[]): void {
    if (this.workspace.selectNodes(nodeIds)) {
      void this.connectors.refresh()
      void this.triggers.refresh()
    }
  }

  public locateRunEvent(sequence: number): boolean {
    const nodeId = this.$.runEventNodes.value.get(sequence)
    return nodeId != null && this.workspace.locateNode(nodeId)
  }

  public async addNode(option: AddNodeOption, position: Point, connection?: (nodeId: string) => Omit<DesignerEdge, 'id'>): Promise<string | undefined> {
    if (option.kind == 'trigger' && 'trigger' in option && option.trigger.kind == 'connect') {
      await this.triggers.connect(option.trigger.provider)
      return
    }
    const nodeId = await this.workspace.addNode(option, position, connection)
    if (nodeId != null && option.kind == 'connector') void this.connectors.refresh()
    if (nodeId != null && option.kind == 'trigger') void this.triggers.refresh()
    return nodeId
  }

  async #mergeAddNodeOptions(
    requests: readonly Promise<readonly AddNodeOption[] | undefined>[],
    signal: AbortSignal,
  ): Promise<readonly AddNodeOption[] | undefined> {
    const results = await Promise.allSettled(requests)
    if (signal.aborted || this.#disposed) return
    const rejected = results.filter((result): result is PromiseRejectedResult => result.status == 'rejected')
    if (rejected.length > 0 && rejected.length == results.length) throw rejected[0]!.reason
    if (rejected.length > 0) this.#notice.set(errorNotice(rejected[0]!.reason, this.#i18n.t))
    return results.flatMap((result) => (result.status == 'fulfilled' ? (result.value ?? []) : []))
  }

  public readonly provideAddNodeOptions = async (searchTerm: string, signal: AbortSignal): Promise<readonly AddNodeOption[] | undefined> => {
    return await this.#mergeAddNodeOptions(
      [this.triggers.provideAddNodeOptions(searchTerm, signal), this.connectors.provideAddNodeOptions(searchTerm, signal)],
      signal,
    )
  }

  public readonly browseAddNodeOptions = async (signal: AbortSignal): Promise<readonly AddNodeOption[] | undefined> => {
    return await this.#mergeAddNodeOptions([this.triggers.browseAddNodeOptions(signal), this.connectors.browseAddNodeOptions(signal)], signal)
  }

  public readonly provideAddNodeOptionChoices = async (optionId: string, signal: AbortSignal): Promise<readonly AddNodeOption[] | undefined> => {
    return await (optionId.startsWith('trigger:')
      ? this.triggers.provideAddNodeOptionChoices(optionId, signal)
      : this.connectors.provideAddNodeOptionChoices(optionId, signal))
  }

  public async refreshSelectedConnector(force = false): Promise<void> {
    await this.connectors.refresh(force)
  }

  public async requestDraftRun() {
    const projectId = this.workspace.$.projectId.value
    const flow = this.workspace.$.targetFlow.value
    const draft = this.workspace.$.draft.value
    if (projectId == null || flow == null || draft == null) return 'unavailable' as const
    return await this.runRequests.requestDraft(projectId, flow, draft)
  }

  public async requestLiveRun() {
    const projectId = this.workspace.$.projectId.value
    const flow = this.workspace.$.targetFlow.value
    if (projectId == null || flow == null) return 'unavailable' as const
    return await this.runRequests.requestLive(projectId, flow)
  }

  async #followExternalRun(client: Pick<WorkbenchClient, 'getRun'>, event: Extract<ProjectChangeEvent, { readonly kind: 'run.created' }>): Promise<void> {
    const target = this.workspace.$.target.value
    if (
      this.#disposed ||
      this.runRequests.$.submitting.value != null ||
      this.workspace.$.projectId.value != event.projectId ||
      target?.kind != 'flow' ||
      target.id != event.flowId
    ) {
      return
    }
    const current = this.#externalRuns.begin()
    try {
      const run = await client.getRun(event.runId)
      const latestTarget = this.workspace.$.target.value
      if (
        !current() ||
        this.#disposed ||
        this.workspace.$.projectId.value != event.projectId ||
        latestTarget?.kind != 'flow' ||
        latestTarget.id != event.flowId ||
        run.projectId != event.projectId ||
        run.flowId != event.flowId ||
        run.runId != event.runId
      ) {
        return
      }
      this.runs.followExternal(run)
    } catch {
      return
    }
  }
}
