import type { I18n } from 'val-i18n'
import type { Settings as NodeSettings, TriggerSettings } from '../../../../project/common/nodeChanges.ts'
import type { WorkbenchClient, Draft, DraftSync, Flow, JsonValue, Project, TriggerSchedule } from '../api.ts'
import type { ProjectChangeEvent } from '../contract.ts'
import type { AddNodeOption } from '../designer/addNodeOptions.ts'
import type { DiagnosticItem } from '../designer/diagnostics.ts'
import type {
  ConditionSettings,
  CodeTaskPorts,
  DesignerTarget,
  NodeClipboard,
  ProjectChanges,
  SubflowSettings,
  TaskSettings,
  ValueSettings,
  WebhookSettings,
} from '../designer/projectChanges.ts'
import type { RevisionView } from '../revisionView.ts'
import type { DesignerEdge, DesignerGraph, DesignerViewport, Point } from '../workspace.ts'
import type { DraftChangeContext } from './draftChanges.ts'
import type { Current } from './latest.ts'
import type { PresentationUpdate } from './presentationChanges.ts'
import type { SetNotice } from './workbenchNotice.ts'
import type { ModuleEditorDraft, Workspace$, WorkspaceState } from './workspaceModel.ts'

import { connect as connectProjectNodes, disconnect as disconnectProjectNodes } from '../../../../project/common/edgeChanges.ts'
import { deleteFlow as deleteProjectFlow, renameFlow as renameProjectFlow } from '../../../../project/common/flowChanges.ts'
import { imports as moduleImports, replaceSource as replaceModuleSource } from '../../../../project/common/moduleChanges.ts'
import {
  setConnectorConnection as changeConnectorConnection,
  setTriggerConnection as changeTriggerConnection,
  updateTrigger,
  updateTriggerConfig,
  updateTriggerSchedule,
} from '../../../../project/common/nodeChanges.ts'
import { addNodeIntent } from '../designer/addNodeOptions.ts'
import { diagnosticFlow } from '../designer/diagnostics.ts'
import {
  addNode as addProjectNode,
  applyProjectChanges,
  copyNodes,
  createResource as createProjectResource,
  deleteSelection,
  pasteNodes,
  setInputValue as changeInputValue,
  updateCondition,
  updateCodeTaskPorts,
  updateNodeDescription,
  updateNodeSettings,
  updateSubflow,
  updateTask,
  updateValue,
  updateWebhook,
} from '../designer/projectChanges.ts'
import { remoteChangeTargets } from '../designer/remoteChangeTargets.ts'
import { createI18n } from '../i18n.ts'
import { revisionView } from '../revisionView.ts'
import { commentIds, designerGraph, initialFlow, removeComments, setComment, setFlowViewport, setNodePositions } from '../workspace.ts'
import { advanceFlowSummaries, DraftChanges } from './draftChanges.ts'
import { Latest } from './latest.ts'
import { PresentationChanges } from './presentationChanges.ts'
import { ProjectCatalog } from './projectCatalog.ts'
import { errorNotice } from './workbenchNotice.ts'
import { moduleEditorStatus, selectedModuleEditor, WorkspaceModel } from './workspaceModel.ts'

const draftRevealDelayMs = 250

interface Clipboard {
  readonly comments: readonly {
    readonly content: string
    readonly position: Point
    readonly sourceId: string
    readonly title: string
  }[]
  readonly nodes: NodeClipboard
}

interface ReconciledRevision {
  readonly revision: RevisionView
  readonly selectedNodeIds: readonly string[]
  readonly target?: DesignerTarget
}

function reconcileTarget(
  revision: RevisionView,
  flows: readonly Flow[],
  previousFlows: readonly Flow[],
  target: DesignerTarget | undefined,
): DesignerTarget | undefined {
  if (target == null) return
  if (target.kind == 'subflow') {
    if (revision.subflow(target.id) != null) return target
    const flow = initialFlow(flows, null)
    return flow == null ? undefined : { id: flow.flowId, kind: 'flow' }
  }
  if (revision.flow(target.id) != null) return target

  const draftIds = new Set(revision.flowIds)
  const previousDraftIds = previousFlows.filter((flow) => flow.draft != null).map((flow) => flow.flowId)
  const index = previousDraftIds.indexOf(target.id)
  const candidates = index < 0 ? previousDraftIds : [...previousDraftIds.slice(index + 1), ...previousDraftIds.slice(0, index).toReversed()]
  const flowId =
    candidates.find((candidate) => draftIds.has(candidate)) ??
    flows.find((flow) => flow.draft != null && draftIds.has(flow.flowId))?.flowId ??
    draftIds.values().next().value
  return flowId == null ? undefined : { id: flowId, kind: 'flow' }
}

export class WorkspaceStore {
  readonly #client: WorkbenchClient
  readonly #draftChanges: DraftChanges
  readonly #draftSession = new Latest()
  readonly #i18n: I18n
  readonly #identity: () => string
  readonly #presentationChanges: PresentationChanges
  readonly #projects: ProjectCatalog
  readonly #runCreated: (event: Extract<ProjectChangeEvent, { readonly kind: 'run.created' }>) => void
  readonly #setNotice: SetNotice
  readonly #model: WorkspaceModel
  #clipboard?: Clipboard
  #diagnosticFocusId = 0
  #draftInvalidation = 0
  #draftReveal?: {
    readonly current: Current
    readonly generation: number
    readonly projectId: string
    readonly target: DesignerTarget
    readonly targets: Set<string>
    timer: ReturnType<typeof globalThis.setTimeout>
    readonly viewport: DesignerViewport
  }
  #draftRevealGeneration = 0
  #draftRevealInvalidation = false
  #draftUpdateNotice = false
  #disposed = false
  #draftSyncQueued = false
  #nodeFocusId = 0
  #stopProjectWatch?: () => void
  public readonly $: Workspace$

  public constructor(
    client: WorkbenchClient,
    setNotice: SetNotice,
    identity: () => string = () => crypto.randomUUID(),
    i18n: I18n = createI18n(),
    runCreated: (event: Extract<ProjectChangeEvent, { readonly kind: 'run.created' }>) => void = () => {},
  ) {
    this.#client = client
    this.#setNotice = setNotice
    this.#identity = identity
    this.#i18n = i18n
    this.#runCreated = runCreated
    this.#projects = new ProjectCatalog(client, setNotice, i18n)
    this.#model = new WorkspaceModel(i18n, this.#projects)
    this.#draftChanges = new DraftChanges(client, setNotice, i18n, {
      apply: (draft, flows, previousFlows, preserveDiagnostics) => this.#applyProjectedDraft(draft, flows, previousFlows, preserveDiagnostics),
      beforeChange: (manageBusy) => {
        this.#cancelDraftReveal()
        this.#draftRevealInvalidation = false
        if (manageBusy) {
          this.#set({ busy: 'designer' })
          this.#setNotice(undefined)
        }
      },
      check: () => void this.#checkTarget(),
      current: (context) => this.#isDraftChangeCurrent(context),
      diagnostics: () => this.#model.value.diagnostics,
      finishChanges: () => {
        if (!this.#disposed && this.#model.value.busy == 'designer') this.#set({ busy: undefined })
      },
      flows: () => this.#model.value.flows,
      headChanged: (projectId, revisionId) => this.#advanceProjectHead(projectId, revisionId),
      recover: (context) => this.#syncDraftHead(context, true),
    })
    this.#presentationChanges = new PresentationChanges(client, setNotice, (presentation) => this.#set({ presentation }), i18n)
    this.$ = this.#model.$
  }

  public dispose(): void {
    this.#cancelDraftReveal()
    this.#disposed = true
    this.#draftSession.invalidate()
    this.#presentationChanges.dispose()
    this.#stopProjectWatch?.()
    this.#model.dispose()
    this.#projects.dispose()
  }

  public async start(projectId?: string, flowId?: string): Promise<void> {
    if (projectId != null) {
      await this.selectProject(projectId, flowId)
      return
    }
    if (!(await this.selectProject(undefined))) return
    if (this.#projects.loaded && !this.#projects.$.failed.value) return
    await this.reloadProjects()
  }

  public async reloadProjects(): Promise<void> {
    await this.#projects.reload()
  }

  public async loadMoreProjects(): Promise<void> {
    await this.#projects.loadMore()
  }

  public async selectProject(projectId: string | undefined, flowId?: string): Promise<boolean> {
    if (!this.#allowModuleNavigation()) return false
    this.#cancelDraftReveal()
    const current = this.#projects.beginSelection()
    this.#draftSession.invalidate()
    this.#draftChanges.reset()
    this.#presentationChanges.reset()
    this.#draftInvalidation = 0
    this.#draftRevealInvalidation = false
    this.#draftUpdateNotice = false
    this.#draftSyncQueued = false
    this.#stopProjectWatch?.()
    this.#stopProjectWatch = undefined
    this.#set({
      checkLoading: false,
      diagnosticFocus: undefined,
      diagnostics: undefined,
      draft: undefined,
      flows: [],
      moduleEditor: undefined,
      nodeFocus: undefined,
      presentation: undefined,
      projectId,
      selectedNodeIds: [],
      target: flowId == null ? undefined : { id: flowId, kind: 'flow' },
      workspaceLoadFailed: false,
      workspaceLoading: projectId != null,
    })
    if (projectId == null) return true
    try {
      const knownProject = this.#projects.project(projectId)
      const [project, draft, flows, presentation] = await Promise.all([
        knownProject ?? this.#client.getProject(projectId),
        this.#client.getDraft(projectId),
        this.#client.listFlows(projectId),
        this.#client.getPresentation(projectId),
      ])
      if (!current()) return false
      const routedFlow = flowId == null ? undefined : flows.find((flow) => flow.flowId == flowId)
      const target = routedFlow == null ? undefined : { id: routedFlow.flowId, kind: 'flow' as const }
      this.#draftChanges.reset(draft)
      this.#presentationChanges.reset(presentation)
      this.#projects.include(project)
      this.#set({
        draft,
        flows,
        presentation,
        target,
        workspaceLoadFailed: false,
        workspaceLoading: false,
      })
      void this.#checkTarget()
      this.#stopProjectWatch = this.#client.watchProject(
        projectId,
        (revisionId) => {
          if (!this.#disposed && revisionId != this.#draftChanges.committed?.revisionId) void this.#refreshDraft(revisionId)
        },
        this.#runCreated,
      )
    } catch (error) {
      if (!current()) return false
      this.#set({ workspaceLoadFailed: true, workspaceLoading: false })
      this.#setNotice(errorNotice(error, this.#i18n.t))
      return false
    }
    return true
  }

  public selectTarget(target: DesignerTarget | undefined): boolean {
    if (!this.#allowModuleNavigation()) return false
    this.#cancelDraftReveal()
    this.#set({
      diagnosticFocus: undefined,
      diagnostics: undefined,
      moduleEditor: undefined,
      nodeFocus: undefined,
      selectedNodeIds: [],
      target,
    })
    void this.#checkTarget()
    return true
  }

  public selectNodes(nodeIds: readonly string[]): boolean {
    if (nodeIds.length == this.#model.value.selectedNodeIds.length && nodeIds.every((nodeId, index) => nodeId == this.#model.value.selectedNodeIds[index]))
      return true
    if (!this.#allowModuleNavigation()) return false
    this.#cancelDraftReveal()
    this.#set({
      diagnosticFocus: undefined,
      moduleEditor: selectedModuleEditor(
        this.#model.value.draft == null ? undefined : revisionView(this.#model.value.draft),
        this.#model.value.target,
        nodeIds,
      ),
      nodeFocus: undefined,
      selectedNodeIds: nodeIds,
    })
    return true
  }

  public async createProject(name: string): Promise<Project | undefined> {
    if (!this.#allowModuleNavigation()) return
    this.#set({ busy: 'project' })
    this.#setNotice(undefined)
    try {
      return await this.#projects.create(name)
    } catch (error) {
      if (!this.#disposed) this.#setNotice(errorNotice(error, this.#i18n.t))
    } finally {
      this.#set({ busy: undefined })
    }
  }

  public async deleteProject(projectId: string): Promise<boolean> {
    if (!this.#allowModuleNavigation()) return false
    const project = this.#projects.project(projectId)
    if (project == null || project.status == 'retiring') return false
    this.#set({ busy: 'project' })
    this.#setNotice(undefined)
    try {
      await this.#client.deleteProject(projectId)
      if (this.#disposed) return false
      this.#projects.remove(projectId)
      this.#setNotice({ kind: 'success', message: this.#i18n.t('notice.projectDeleteAccepted', { name: project.name }) })
      return true
    } catch (error) {
      if (!this.#disposed) this.#setNotice(errorNotice(error, this.#i18n.t))
      return false
    } finally {
      this.#set({ busy: undefined })
    }
  }

  public async createResource(kind: DesignerTarget['kind'], name: string): Promise<boolean> {
    if (!this.#allowModuleNavigation()) return false
    if (this.#model.value.draft == null) return false
    const id = this.#identity()
    this.#set({ busy: 'resource' })
    this.#setNotice(undefined)
    const changed = await this.#changeDraft(createProjectResource(kind, id, name), false)
    this.#set({ busy: undefined })
    if (changed == null) return false
    this.selectTarget({ id, kind })
    this.#setNotice({
      kind: 'success',
      message: this.#i18n.t('notice.createdInDraft', { name }),
    })
    return true
  }

  public async renameFlow(flowId: string, name: string): Promise<boolean> {
    const flow = this.$.revision.value?.flow(flowId)
    const nextName = name.trim()
    if (flow == null || nextName.length == 0) return false
    if (flow.name == nextName) return true
    this.#set({ busy: 'resource' })
    this.#setNotice(undefined)
    const changed = await this.#changeDraft(renameProjectFlow(flowId, nextName), false)
    this.#set({ busy: undefined })
    if (changed == null) return false
    this.#setNotice({
      kind: 'success',
      message: this.#i18n.t('notice.flowRenamed', { name: nextName }),
    })
    return true
  }

  public async deleteFlow(flowId: string): Promise<boolean> {
    const flow = this.#model.value.flows.find((candidate) => candidate.flowId == flowId)
    if (flow?.draft == null) return false
    if (this.#model.value.target?.kind == 'flow' && this.#model.value.target.id == flowId && !this.#allowModuleNavigation()) return false
    this.#set({ busy: 'resource' })
    this.#setNotice(undefined)
    const changed = await this.#changeDraft(deleteProjectFlow(flowId), false)
    this.#set({ busy: undefined })
    if (changed == null) return false
    this.#setNotice({
      kind: 'success',
      message: this.#i18n.t('notice.flowDeleted', { name: flow.draft.name }),
    })
    return true
  }

  public async addNode(option: AddNodeOption, position: Point, connection?: (nodeId: string) => Omit<DesignerEdge, 'id'>): Promise<string | undefined> {
    if (!this.#allowModuleNavigation()) return
    const draft = this.#model.value.draft
    const target = this.#model.value.target
    if (draft == null || target == null) return
    const nodeId = this.#identity()
    if (option.kind == 'comment') return await this.#addComment(target, nodeId, position)
    const revision = revisionView(draft)
    const intent = addNodeIntent(option, revision, target, this.#i18n.t)
    if (intent == null) return
    const nodeChanges = addProjectNode(revision, target, nodeId, intent, this.#identity)
    if (nodeChanges == null) return
    const changes =
      connection == null ? nodeChanges : [...nodeChanges, ...connectProjectNodes(applyProjectChanges(draft, nodeChanges).content, target, connection(nodeId))]
    const change = this.#changeDraft(changes)
    this.selectNodes([nodeId])
    const move = this.moveNodes({ [nodeId]: position })
    if ((await change) == null) return
    await move
    return nodeId
  }

  public async connect(edge: Omit<DesignerEdge, 'id'>): Promise<void> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return
    const changes = connectProjectNodes(revision.revision.content, target, edge)
    if (changes.length > 0) await this.#changeDraft(changes)
  }

  public async disconnect(edge: DesignerEdge): Promise<void> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return
    const changes = disconnectProjectNodes(revision.revision.content, target, edge)
    if (changes.length > 0) await this.#changeDraft(changes)
  }

  public async deleteSelectedNodes(): Promise<void> {
    if (!this.#allowModuleNavigation()) return
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null || this.#model.value.selectedNodeIds.length == 0) return
    const comments = commentIds(this.#model.value.presentation?.value ?? {}, target)
    const commentNodes = new Set(this.#model.value.selectedNodeIds.filter((nodeId) => comments.has(nodeId)))
    const changes = deleteSelection(revision, target, this.#model.value.selectedNodeIds)
    const draftChange = changes.length == 0 ? undefined : this.#changeDraft(changes)
    const presentationChange = commentNodes.size == 0 ? undefined : this.#changePresentation((value) => removeComments(value, target, commentNodes))
    this.selectNodes([])
    if (draftChange != null && (await draftChange) == null) return
    await presentationChange
  }

  public copySelectedNodes(): void {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null || this.#model.value.selectedNodeIds.length == 0) return
    const selected = new Set(this.#model.value.selectedNodeIds)
    this.#clipboard = {
      comments: this.#designer().nodes.flatMap((node) =>
        node.kind == 'comment' && selected.has(node.id)
          ? [
              {
                content: node.content,
                position: node.position,
                sourceId: node.id,
                title: node.title,
              },
            ]
          : [],
      ),
      nodes: copyNodes(revision, target, this.#model.value.selectedNodeIds),
    }
  }

  public async pasteNodes(): Promise<void> {
    if (!this.#allowModuleNavigation()) return
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null || this.#clipboard == null) return
    const pasted = pasteNodes(revision, target, this.#clipboard.nodes, this.#identity)
    const draftChange = pasted.changes.length == 0 ? undefined : this.#changeDraft(pasted.changes)
    const comments = this.#clipboard.comments.map((comment) => ({
      ...comment,
      nodeId: this.#identity(),
    }))
    if (pasted.nodeIds.length == 0 && comments.length == 0) return
    const designerNodes = new Map(this.#designer().nodes.map((node) => [node.id, node]))
    const positions = Object.fromEntries(
      pasted.sourceIds.map((sourceId, index) => {
        const source = designerNodes.get(sourceId)
        return [
          pasted.nodeIds[index]!,
          {
            x: (source?.position.x ?? 80) + 40,
            y: (source?.position.y ?? 80) + 40,
          },
        ]
      }),
    )
    const presentationChange = this.#changePresentation((value) => {
      let next = setNodePositions(value, target, positions)
      for (const comment of comments) {
        next = setComment(next, target, comment.nodeId, {
          content: comment.content,
          position: { x: comment.position.x + 40, y: comment.position.y + 40 },
          title: this.#i18n.t('addNode.commentCopy', { title: comment.title }),
        })
      }
      return next
    })
    this.selectNodes([...pasted.nodeIds, ...comments.map((comment) => comment.nodeId)])
    if (draftChange != null && (await draftChange) == null) return
    await presentationChange
  }

  public async duplicateSelectedNodes(): Promise<void> {
    this.copySelectedNodes()
    await this.pasteNodes()
  }

  public async saveNodeSettings(nodeId: string, settings: NodeSettings): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return false
    const changes = updateNodeSettings(revision, target, nodeId, settings)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveNodeDescription(nodeId: string, description: string | undefined): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return false
    const changes = updateNodeDescription(revision, target, nodeId, description)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async setInputValue(nodeId: string, handle: string, value: JsonValue | undefined): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return false
    const changes = changeInputValue(revision, target, nodeId, handle, value)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveCondition(nodeId: string, settings: ConditionSettings): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return false
    const changes = updateCondition(revision, target, nodeId, settings)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveValue(nodeId: string, values: readonly ValueSettings[]): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return false
    const changes = updateValue(revision, target, nodeId, values)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveComment(nodeId: string, comment: { readonly content: string; readonly title: string }): Promise<void> {
    const target = this.#model.value.target
    if (target == null) return
    const position = this.#designer().nodes.find((node) => node.id == nodeId)?.position
    if (position == null) return
    await this.#changePresentation((value) => setComment(value, target, nodeId, { ...comment, position }))
  }

  public async saveTaskSettings(nodeId: string, settings: TaskSettings): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return false
    const changes = updateTask(revision, target, nodeId, settings)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveCodeTaskPorts(nodeId: string, ports: CodeTaskPorts): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null) return false
    const changes = updateCodeTaskPorts(revision, target, nodeId, ports)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async setConnectorConnection(taskId: string, connectionId: string): Promise<boolean> {
    const revision = this.$.revision.value
    if (revision == null) return false
    const changes = changeConnectorConnection(revision.revision.content, taskId, connectionId)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveTriggerSettings(triggerId: string, settings: TriggerSettings): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target?.kind != 'flow') return false
    const changes = updateTrigger(revision.revision.content, target, triggerId, settings)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveTriggerConfig(triggerId: string, name: string, value: JsonValue | undefined): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target?.kind != 'flow') return false
    const changes = updateTriggerConfig(revision.revision.content, target, triggerId, name, value)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveTriggerSchedule(triggerId: string, schedule: readonly TriggerSchedule[]): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target?.kind != 'flow') return false
    const changes = updateTriggerSchedule(revision.revision.content, target, triggerId, schedule)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveWebhook(triggerId: string, settings: WebhookSettings): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target?.kind != 'flow') return false
    const changes = updateWebhook(revision, target, triggerId, settings)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async setTriggerConnection(triggerId: string, connectionId: string): Promise<boolean> {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target?.kind != 'flow') return false
    const changes = changeTriggerConnection(revision.revision.content, target, triggerId, connectionId)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public async saveSubflowSettings(subflowId: string, settings: SubflowSettings): Promise<boolean> {
    const revision = this.$.revision.value
    if (revision == null) return false
    const changes = updateSubflow(revision, subflowId, settings)
    return changes != null && (await this.#changeDraft(changes)) != null
  }

  public updateModuleSource(source: string): void {
    const editor = this.#model.value.moduleEditor
    if (editor == null || editor.source == source) return
    this.#set({ moduleEditor: { ...editor, phase: undefined, source } })
  }

  public discardModuleChanges(): void {
    const editor = this.#model.value.moduleEditor
    if (editor == null) return
    const module = this.#model.value.draft?.content.modules[editor.moduleId]
    if (module == null) {
      this.#set({ moduleEditor: undefined })
      return
    }
    this.#set({
      moduleEditor: { moduleId: editor.moduleId, source: module.source },
    })
  }

  public async saveModuleEditor(): Promise<boolean> {
    const editor = this.#model.value.moduleEditor
    if (editor == null || editor.phase == 'saving') return false
    this.#set({ moduleEditor: { ...editor, phase: 'saving' } })
    const imports = await moduleImports(editor.source)
    if (this.#disposed) return false
    const changed = await this.#changeDraft(replaceModuleSource(editor.moduleId, editor.source, imports))
    if (!this.#disposed && this.#model.value.moduleEditor?.moduleId == editor.moduleId) {
      this.#set({
        moduleEditor: {
          ...this.#model.value.moduleEditor,
          phase: changed == null ? 'failed' : undefined,
        },
      })
    }
    return changed != null
  }

  public async moveNodes(positions: Readonly<Record<string, Point>>): Promise<void> {
    const target = this.#model.value.target
    if (target == null) return
    await this.#changePresentation((value) => setNodePositions(value, target, positions))
  }

  public async moveViewport(viewport: DesignerViewport): Promise<void> {
    const target = this.#model.value.target
    if (target == null) return
    const current = this.#designer().viewport
    if (current.x != viewport.x || current.y != viewport.y || current.zoom != viewport.zoom) this.#cancelDraftReveal()
    await this.#changePresentation((value) => setFlowViewport(value, target, viewport))
  }

  public async check(): Promise<void> {
    await this.#checkTarget()
  }

  public async refreshFlows(): Promise<void> {
    const projectId = this.#model.value.projectId
    if (projectId == null) return
    const current = this.#projects.capture()
    const flows = await this.#client.listFlows(projectId)
    if (current() && projectId == this.#model.value.projectId) this.#set({ flows })
  }

  public locateNode(nodeId: string): boolean {
    const revision = this.$.revision.value
    const target = this.#model.value.target
    if (revision == null || target == null || revision.node(target, nodeId) == null || !this.selectNodes([nodeId])) return false
    this.#set({ nodeFocus: { nodeId, requestId: ++this.#nodeFocusId } })
    return true
  }

  public locateDiagnostic(item: DiagnosticItem): boolean {
    if (item.location == null || !this.selectNodes([item.location.nodeId])) return false
    this.#set({
      diagnosticFocus: {
        ...item.location,
        diagnostic: item.diagnostic,
        requestId: ++this.#diagnosticFocusId,
      },
    })
    return true
  }

  async #addComment(target: DesignerTarget, nodeId: string, position: Point): Promise<string | undefined> {
    const number = Math.max(
      0,
      ...this.#designer().nodes.flatMap((node) => {
        if (node.kind != 'comment') return []
        const match = /#(\d+)$/.exec(node.title)
        return match == null ? [] : [Number(match[1])]
      }),
    )
    const change = this.#changePresentation((value) =>
      setComment(value, target, nodeId, {
        content: '',
        position,
        title: this.#i18n.t('addNode.commentName', { number: number + 1 }),
      }),
    )
    this.selectNodes([nodeId])
    await change
    if (this.#disposed) return
    return nodeId
  }

  async #changeDraft(changes: ProjectChanges, manageBusy = true): Promise<Draft | undefined> {
    const projectId = this.#model.value.projectId
    const draft = this.#model.value.draft
    if (projectId == null || draft == null) return
    return await this.#draftChanges.change({ current: this.#draftSession.capture(), projectId }, draft, changes, manageBusy)
  }

  #applyProjectedDraft(draft: Draft, flows: readonly Flow[], previousFlows: readonly Flow[], preserveDiagnostics = false): RevisionView {
    const previousDraft = this.#model.value.draft
    const { revision, selectedNodeIds, target } = this.#reconcileRevision(draft, flows, previousFlows)
    const currentEditor = this.#model.value.moduleEditor
    this.#set({
      diagnostics: preserveDiagnostics ? this.#model.value.diagnostics : undefined,
      draft,
      flows,
      moduleEditor:
        currentEditor != null && previousDraft != null && moduleEditorStatus(previousDraft, currentEditor) != 'saved'
          ? currentEditor
          : selectedModuleEditor(revision, target, selectedNodeIds),
      selectedNodeIds,
      target,
    })
    return revision
  }

  async #changePresentation(update: PresentationUpdate): Promise<void> {
    if (this.#disposed) return
    const projectId = this.#model.value.projectId
    const presentation = this.#model.value.presentation
    if (projectId != null && presentation != null) await this.#presentationChanges.change(projectId, presentation, this.#projects.capture(), update)
  }

  async #checkTarget(): Promise<void> {
    if (this.#disposed) return
    const projectId = this.#model.value.projectId
    const draft = this.#model.value.draft
    const target = this.#model.value.target
    if (projectId == null || draft == null || target == null) {
      if (target == null) this.#set({ checkLoading: false, diagnostics: undefined })
      return
    }
    const flowId = diagnosticFlow(revisionView(draft), target)
    if (flowId == null) {
      this.#set({ checkLoading: false, diagnostics: undefined })
      return
    }
    this.#set({ checkLoading: true, diagnosticFocus: undefined })
    try {
      const diagnostics = await this.#client.checkFlow(projectId, draft.revisionId, flowId)
      if (!this.#disposed && projectId == this.#model.value.projectId && draft.revisionId == this.#model.value.draft?.revisionId) this.#set({ diagnostics })
    } catch (error) {
      if (!this.#disposed && projectId == this.#model.value.projectId && draft.revisionId == this.#model.value.draft?.revisionId) {
        this.#setNotice(errorNotice(error, this.#i18n.t))
      }
    } finally {
      if (!this.#disposed && projectId == this.#model.value.projectId && draft.revisionId == this.#model.value.draft?.revisionId)
        this.#set({ checkLoading: false })
    }
  }

  async #refreshDraft(revisionId?: string): Promise<void> {
    if (this.#disposed) return
    const projectId = this.#model.value.projectId
    if (projectId == null) return
    this.#draftInvalidation += 1
    if (revisionId != null) {
      this.#draftUpdateNotice = true
      if (!this.#draftChanges.changing) this.#draftRevealInvalidation = true
    }
    if (this.#draftSyncQueued) return
    this.#draftSyncQueued = true
    const context = { current: this.#draftSession.capture(), projectId }
    await this.#draftChanges.enqueue(async () => {
      let generation: number
      do {
        generation = this.#draftInvalidation
        const reveal = this.#draftRevealInvalidation
        const revealGeneration = this.#draftRevealGeneration
        const notifyUpdate = this.#draftUpdateNotice
        this.#draftRevealInvalidation = false
        this.#draftUpdateNotice = false
        await this.#syncDraftHead(context, false, notifyUpdate, reveal, revealGeneration)
      } while (this.#isDraftChangeCurrent(context) && generation != this.#draftInvalidation)
    })
    if (this.#isDraftChangeCurrent(context)) this.#draftSyncQueued = false
  }

  async #syncDraftHead(
    context: DraftChangeContext,
    reportError: boolean,
    notifyUpdate = false,
    revealRemoteChanges = false,
    revealGeneration = this.#draftRevealGeneration,
  ): Promise<boolean> {
    try {
      const revealTarget = revealRemoteChanges ? this.#model.value.target : undefined
      const base = this.#draftChanges.committed
      if (base == null) return false

      let synced = await this.#client.syncDraft(context.projectId, base.revisionId)
      if (!this.#isDraftChangeCurrent(context)) return false
      if (synced.kind == 'changes' && synced.revisions.length == 0) return true
      let committed: Draft
      try {
        committed = this.#materializeDraftSync(base, synced)
      } catch {
        synced = await this.#client.syncDraft(context.projectId)
        if (!this.#isDraftChangeCurrent(context)) return false
        committed = this.#materializeDraftSync(base, synced)
      }
      if (committed.revisionId == base.revisionId) return true

      const revealTargets =
        synced.kind == 'changes' && revealTarget != null
          ? remoteChangeTargets(
              revisionView(base),
              revisionView(committed),
              revealTarget,
              synced.revisions.flatMap((revision) => revision.operations),
            )
          : undefined
      if (synced.kind == 'snapshot') this.#cancelDraftReveal()

      const previousFlows = this.#model.value.flows
      const flows = advanceFlowSummaries(previousFlows, synced.draftFlows, committed)
      const diagnostics = this.#model.value.diagnostics
      const preserveDiagnostics =
        this.#draftChanges.pendingCount == 0 &&
        diagnostics != null &&
        flows.find((flow) => flow.flowId == diagnostics.flowId)?.draft?.closureDigest == diagnostics.closureDigest
      const preserveModuleEditor = this.#applyExternalDraft(committed, flows, preserveDiagnostics)
      this.#advanceProjectHead(context.projectId, committed.revisionId)
      if (
        synced.kind == 'changes' &&
        synced.revisions.length > 0 &&
        revealTarget != null &&
        revealTargets != null &&
        revealGeneration == this.#draftRevealGeneration
      ) {
        this.#queueDraftReveal(context, revealTarget, revealTargets, revealGeneration)
      }
      if (notifyUpdate) {
        this.#setNotice({
          kind: preserveModuleEditor ? 'error' : 'success',
          message: this.#i18n.t(preserveModuleEditor ? 'notice.moduleUpdated' : 'notice.draftUpdated'),
        })
        if (!preserveDiagnostics) void this.#checkTarget()
      }
      return true
    } catch (error) {
      if (reportError && this.#isDraftChangeCurrent(context)) this.#setNotice(errorNotice(error, this.#i18n.t))
      return false
    }
  }

  #materializeDraftSync(base: Draft, sync: DraftSync): Draft {
    if (sync.kind == 'snapshot') return sync.draft
    let draft = base
    for (const change of sync.revisions) {
      if (change.revision.parentRevisionId != draft.revisionId) throw new Error('Invalid Draft revision chain.')
      draft = { ...change.revision, content: applyProjectChanges(draft, change.operations).content }
    }
    return draft
  }

  #queueDraftReveal(context: DraftChangeContext, target: DesignerTarget, targets: ReadonlySet<string>, generation: number): void {
    const state = this.#model.value
    if (!this.#isDraftChangeCurrent(context) || generation != this.#draftRevealGeneration) return
    if (state.target?.kind != target.kind || state.target.id != target.id) return

    const pending = this.#draftReveal
    if (pending != null) {
      if (pending.projectId != context.projectId || pending.target.kind != target.kind || pending.target.id != target.id) {
        this.#cancelDraftReveal()
        return
      }
      for (const nodeId of targets) pending.targets.add(nodeId)
      globalThis.clearTimeout(pending.timer)
      pending.timer = globalThis.setTimeout(() => this.#finishDraftReveal(), draftRevealDelayMs)
      return
    }
    if (targets.size == 0 || state.selectedNodeIds.length > 0) return

    this.#draftReveal = {
      current: context.current,
      generation,
      projectId: context.projectId,
      target,
      targets: new Set(targets),
      timer: globalThis.setTimeout(() => this.#finishDraftReveal(), draftRevealDelayMs),
      viewport: this.#designer().viewport,
    }
  }

  #finishDraftReveal(): void {
    const reveal = this.#draftReveal
    this.#draftReveal = undefined
    if (reveal == null || !reveal.current() || reveal.generation != this.#draftRevealGeneration) return

    const state = this.#model.value
    if (state.projectId != reveal.projectId || state.target?.kind != reveal.target.kind || state.target.id != reveal.target.id) return
    if (state.selectedNodeIds.length > 0) return
    const viewport = this.#designer().viewport
    if (viewport.x != reveal.viewport.x || viewport.y != reveal.viewport.y || viewport.zoom != reveal.viewport.zoom) return
    if (state.draft == null) return
    const revision = revisionView(state.draft)
    const targets = [...reveal.targets].filter((nodeId) => revision.selection(reveal.target, nodeId) != null)
    if (targets.length != 1) return
    this.#set({ nodeFocus: { nodeId: targets[0]!, requestId: ++this.#nodeFocusId } })
  }

  #cancelDraftReveal(): void {
    this.#draftRevealGeneration += 1
    if (this.#draftReveal != null) globalThis.clearTimeout(this.#draftReveal.timer)
    this.#draftReveal = undefined
  }

  #advanceProjectHead(projectId: string, revisionId: string): void {
    this.#projects.advanceHead(projectId, revisionId)
  }

  #designer(): DesignerGraph {
    const state = this.#model.value
    return designerGraph(state.draft, state.target, state.presentation?.value, state.diagnostics?.diagnostics, {}, {}, this.#i18n.t)
  }

  #allowModuleNavigation(): boolean {
    const editor = this.#model.value.moduleEditor
    if (editor == null || moduleEditorStatus(this.#model.value.draft, editor) == 'saved') return true
    this.#setNotice({
      kind: 'error',
      message: this.#i18n.t('notice.unsavedCode'),
    })
    return false
  }

  #reconcileRevision(draft: Draft, flows: readonly Flow[], previousFlows: readonly Flow[]): ReconciledRevision {
    const revision = revisionView(draft)
    const target = reconcileTarget(revision, flows, previousFlows, this.#model.value.target)
    const selectedNodeIds = this.#model.value.selectedNodeIds.filter((nodeId) => target != null && revision.selection(target, nodeId) != null)
    return { revision, selectedNodeIds, target }
  }

  #applyExternalDraft(committed: Draft, flows: readonly Flow[], preserveDiagnostics: boolean): boolean {
    this.#draftChanges.replaceCommitted(committed)
    const draft = this.#draftChanges.project(committed)
    const editor = this.#model.value.moduleEditor
    const preserveModuleEditor = editor != null && moduleEditorStatus(this.#model.value.draft, editor) != 'saved'
    const previousFlows = this.#model.value.flows
    const reconciled = this.#reconcileRevision(draft, flows, previousFlows)
    const previousFlowIds = new Set(previousFlows.map((flow) => flow.flowId))
    const createdFlows =
      this.#model.value.target == null
        ? flows.filter((flow) => flow.draft != null && reconciled.revision.flow(flow.flowId) != null && !previousFlowIds.has(flow.flowId))
        : []
    const target = createdFlows.length == 1 ? { id: createdFlows[0]!.flowId, kind: 'flow' as const } : reconciled.target
    this.#set({
      diagnostics: preserveDiagnostics ? this.#model.value.diagnostics : undefined,
      draft,
      flows,
      moduleEditor: this.#moduleEditorAfterExternalDraft(reconciled.revision, target, reconciled.selectedNodeIds),
      selectedNodeIds: reconciled.selectedNodeIds,
      target,
    })
    return preserveModuleEditor
  }

  #moduleEditorAfterExternalDraft(
    revision: RevisionView,
    target: DesignerTarget | undefined,
    selectedNodeIds: readonly string[],
  ): ModuleEditorDraft | undefined {
    const editor = this.#model.value.moduleEditor
    if (editor == null || moduleEditorStatus(this.#model.value.draft, editor) == 'saved') {
      return selectedModuleEditor(revision, target, selectedNodeIds)
    }
    return { ...editor, phase: 'failed' }
  }

  #isDraftChangeCurrent(context: DraftChangeContext): boolean {
    return !this.#disposed && context.projectId == this.#model.value.projectId && context.current()
  }

  #set(patch: Partial<WorkspaceState>): void {
    if (this.#disposed) return
    this.#model.set(patch)
  }
}
