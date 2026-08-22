import type { I18n } from 'val-i18n'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { Diagnostic, Draft, Flow, FlowCheck, Presentation, Project } from '../api.ts'
import type { AddNodeOption } from '../designer/addNodeOptions.ts'
import type { DiagnosticFocus, DiagnosticItem } from '../designer/diagnostics.ts'
import type { DesignerTarget } from '../designer/projectChanges.ts'
import type { ResolvedSelection, RevisionView } from '../revisionView.ts'
import type { ProjectCatalog } from './projectCatalog.ts'

import { compute, derive, val } from 'value-enhancer'
import { deriveAddNodeOptions } from '../designer/addNodeOptions.ts'
import { diagnosticItems, deriveInspectorDiagnostics } from '../designer/diagnostics.ts'
import { revisionView } from '../revisionView.ts'

export type WorkspaceBusy = 'designer' | 'resource' | 'project'
export type WorkspaceStatus = 'loading' | 'noDraft' | 'saved' | 'saving'
export type ModuleEditorStatus = 'dirty' | 'failed' | 'saved' | 'saving'

export interface ModuleEditor {
  readonly moduleId: string
  readonly source: string
  readonly status: ModuleEditorStatus
}

export interface NodeFocus {
  readonly nodeId: string
  readonly requestId: number
}

export interface ModuleEditorDraft {
  readonly moduleId: string
  readonly phase?: 'failed' | 'saving'
  readonly source: string
}

export interface WorkspaceState {
  readonly busy?: WorkspaceBusy
  readonly checkLoading: boolean
  readonly diagnosticFocus?: DiagnosticFocus
  readonly diagnostics?: FlowCheck
  readonly draft?: Draft
  readonly flows: readonly Flow[]
  readonly moduleEditor?: ModuleEditorDraft
  readonly nodeFocus?: NodeFocus
  readonly presentation?: Presentation
  readonly projectId?: string
  readonly selectedNodeIds: readonly string[]
  readonly target?: DesignerTarget
  readonly workspaceLoadFailed: boolean
  readonly workspaceLoading: boolean
}

interface RevisionContext {
  readonly revision?: RevisionView
  readonly target?: DesignerTarget
}

export interface Workspace$ {
  readonly addNodeOptions: ReadonlyVal<readonly AddNodeOption[]>
  readonly busy: ReadonlyVal<WorkspaceBusy | undefined>
  readonly checkLoading: ReadonlyVal<boolean>
  readonly diagnostics: ReadonlyVal<FlowCheck | undefined>
  readonly diagnosticFocus: ReadonlyVal<DiagnosticFocus | undefined>
  readonly diagnosticItems: ReadonlyVal<readonly DiagnosticItem[]>
  readonly draft: ReadonlyVal<Draft | undefined>
  readonly flows: ReadonlyVal<readonly Flow[]>
  readonly inspectorDiagnostics: ReadonlyVal<readonly Diagnostic[]>
  readonly moduleDiagnostics: ReadonlyVal<readonly Diagnostic[]>
  readonly moduleEditor: ReadonlyVal<ModuleEditor | undefined>
  readonly nodeFocus: ReadonlyVal<NodeFocus | undefined>
  readonly presentation: ReadonlyVal<Presentation | undefined>
  readonly project: ReadonlyVal<Project | undefined>
  readonly projectId: ReadonlyVal<string | undefined>
  readonly projectLoadFailed: ReadonlyVal<boolean>
  readonly projectLoadMoreFailed: ReadonlyVal<boolean>
  readonly projectLoading: ReadonlyVal<boolean>
  readonly projectLoadingMore: ReadonlyVal<boolean>
  readonly projectNextCursor: ReadonlyVal<string | undefined>
  readonly projectTotal: ReadonlyVal<number | undefined>
  readonly projects: ReadonlyVal<readonly Project[]>
  readonly revision: ReadonlyVal<RevisionView | undefined>
  readonly selection: ReadonlyVal<ResolvedSelection | undefined>
  readonly selectedNodeIds: ReadonlyVal<readonly string[]>
  readonly status: ReadonlyVal<WorkspaceStatus>
  readonly target: ReadonlyVal<DesignerTarget | undefined>
  readonly targetFlow: ReadonlyVal<Flow | undefined>
  readonly targetName: ReadonlyVal<string | undefined>
  readonly workspaceLoadFailed: ReadonlyVal<boolean>
  readonly workspaceLoading: ReadonlyVal<boolean>
}

const initialState: WorkspaceState = {
  checkLoading: false,
  flows: [],
  selectedNodeIds: [],
  workspaceLoadFailed: false,
  workspaceLoading: false,
}

function status(state: WorkspaceState): WorkspaceStatus {
  if (state.workspaceLoading) return 'loading'
  if (state.busy == 'designer') return 'saving'
  if (state.draft == null) return 'noDraft'
  return 'saved'
}

export function moduleEditorStatus(draft: Draft | undefined, editor: ModuleEditorDraft): ModuleEditorStatus {
  if (editor.phase != null) return editor.phase
  const module = draft?.content.modules[editor.moduleId]
  if (module == null) return 'failed'
  return editor.source == module.source ? 'saved' : 'dirty'
}

export function selectedModuleEditor(
  revision: RevisionView | undefined,
  target: DesignerTarget | undefined,
  nodeIds: readonly string[],
): ModuleEditorDraft | undefined {
  if (revision == null || target == null || nodeIds.length != 1) return
  const node = revision.node(target, nodeIds[0]!)
  if (node?.kind != 'task' || node.definition == null || !('moduleId' in node.definition) || node.module == null) return
  return {
    moduleId: node.definition.moduleId,
    source: node.module.source,
  }
}

export class WorkspaceModel {
  readonly #revisionContext: ReadonlyVal<RevisionContext>
  readonly #state: Val<WorkspaceState> = val(initialState)
  readonly #projectValues: ReadonlySet<ReadonlyVal<unknown>>
  public readonly $: Workspace$

  public constructor(i18n: I18n, projects: ProjectCatalog) {
    const busy = derive(this.#state, (state) => state.busy)
    const checkLoading = derive(this.#state, (state) => state.checkLoading)
    const diagnosticFocus = derive(this.#state, (state) => state.diagnosticFocus)
    const diagnostics = derive(this.#state, (state) => state.diagnostics)
    const draft = derive(this.#state, (state) => state.draft)
    const flows = derive(this.#state, (state) => state.flows)
    const moduleEditor = derive(this.#state, (state) => {
      if (state.moduleEditor == null) return
      const { phase: _phase, ...editor } = state.moduleEditor
      return {
        ...editor,
        status: moduleEditorStatus(state.draft, state.moduleEditor),
      }
    })
    const nodeFocus = derive(this.#state, (state) => state.nodeFocus)
    const presentation = derive(this.#state, (state) => state.presentation)
    const projectId = derive(this.#state, (state) => state.projectId)
    const revision = derive(this.#state, (state) => (state.draft == null ? undefined : revisionView(state.draft)))
    const selectedNodeIds = derive(this.#state, (state) => state.selectedNodeIds)
    const target = derive(this.#state, (state) => state.target)
    const workspaceLoadFailed = derive(this.#state, (state) => state.workspaceLoadFailed)
    const workspaceLoading = derive(this.#state, (state) => state.workspaceLoading)
    this.#revisionContext = derive(
      this.#state,
      (state) => ({
        revision: state.draft == null ? undefined : revisionView(state.draft),
        target: state.target,
      }),
      {
        equal: (next, previous) => next.revision === previous.revision && next.target === previous.target,
      },
    )
    const selection = derive(this.#state, (state) => {
      if (state.draft == null || state.target == null || state.selectedNodeIds.length != 1) return
      return revisionView(state.draft).selection(state.target, state.selectedNodeIds[0]!)
    })
    this.$ = {
      addNodeOptions: compute((get) => {
        const { revision: currentRevision, target: currentTarget } = get(this.#revisionContext)
        return deriveAddNodeOptions(currentRevision?.revision, currentTarget, get(i18n.t$))
      }),
      busy,
      checkLoading,
      diagnosticFocus,
      diagnosticItems: derive(this.#state, (state) =>
        diagnosticItems(state.draft == null ? undefined : revisionView(state.draft), state.target, state.diagnostics),
      ),
      diagnostics,
      draft,
      flows,
      inspectorDiagnostics: derive(this.#state, (state) =>
        deriveInspectorDiagnostics(state.draft == null ? undefined : revisionView(state.draft), state.target, state.diagnostics, selection.value),
      ),
      moduleDiagnostics: derive(this.#state, (state) => {
        const moduleId = state.moduleEditor?.moduleId
        return moduleId == null ? [] : (state.diagnostics?.diagnostics.filter((diagnostic) => diagnostic.path.startsWith(`/modules/${moduleId}/source`)) ?? [])
      }),
      moduleEditor,
      nodeFocus,
      presentation,
      project: compute((get) => {
        const selectedProjectId = get(projectId)
        return selectedProjectId == null ? undefined : get(projects.$.projects).find((project) => project.projectId == selectedProjectId)
      }),
      projectId,
      projectLoadFailed: projects.$.failed,
      projectLoadMoreFailed: projects.$.loadMoreFailed,
      projectLoading: projects.$.loading,
      projectLoadingMore: projects.$.loadingMore,
      projectNextCursor: projects.$.nextCursor,
      projectTotal: projects.$.total,
      projects: projects.$.projects,
      revision,
      selection,
      selectedNodeIds,
      status: derive(this.#state, status),
      target,
      targetFlow: derive(this.#state, (state) =>
        state.target?.kind == 'flow' ? state.flows.find((candidate) => candidate.flowId == state.target?.id) : undefined,
      ),
      targetName: derive(this.#state, (state) => {
        if (state.target == null) return
        if (state.draft == null) return state.target.id
        const currentRevision = revisionView(state.draft)
        return (state.target.kind == 'flow' ? currentRevision.flow(state.target.id)?.name : currentRevision.subflow(state.target.id)?.name) ?? state.target.id
      }),
      workspaceLoadFailed,
      workspaceLoading,
    }
    this.#projectValues = new Set(Object.values(projects.$))
  }

  public get value(): WorkspaceState {
    return this.#state.value
  }

  public set(patch: Partial<WorkspaceState>): void {
    this.#state.set({ ...this.#state.value, ...patch })
  }

  public dispose(): void {
    for (const value of Object.values(this.$)) {
      if (!this.#projectValues.has(value)) value.dispose()
    }
    this.#revisionContext.dispose()
    this.#state.dispose()
  }
}
