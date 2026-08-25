import type { I18n } from 'val-i18n'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { FlowRunInputEditorStore } from '../../flowRunInputEditorStore.ts'
import type { WorkbenchClient, Draft, Flow, InputPortDefinition, JsonValue, Run } from '../api.ts'
import type { ResolvedNode } from '../revisionView.ts'
import type { Current } from '../stores/latest.ts'
import type { SetNotice } from '../stores/workbenchNotice.ts'
import type { RunStore } from './runStore.ts'

import { compute, derive, val } from 'value-enhancer'
import { createI18n } from '../i18n.ts'
import { revisionView } from '../revisionView.ts'
import { Latest } from '../stores/latest.ts'
import { errorNotice } from '../stores/workbenchNotice.ts'

interface RequestState {
  readonly inputRequest?: RunInputRequest
  readonly starting: boolean
  readonly submitting?: RunSource
}

type Client = Pick<WorkbenchClient, 'createDraftRun' | 'createLiveRun' | 'getRevision'>

export interface RunRequest$ {
  readonly inputRequest: ReadonlyVal<RunInputRequest | undefined>
  readonly starting: ReadonlyVal<boolean>
  readonly submitting: ReadonlyVal<RunSource | undefined>
}

export interface RunInputGroup {
  readonly editor: FlowRunInputEditorStore
  readonly nodeId: string
  readonly title: string
}

export interface RunInputRequest {
  readonly attempted: boolean
  readonly flow: Flow
  readonly groups: readonly RunInputGroup[]
  readonly projectId: string
  readonly revisionId: string
  readonly source: RunSource
  readonly valid: ReadonlyVal<boolean>
}

export type RunRequestOutcome = 'input' | 'started' | 'unavailable'
export type RunSource = Run['source']

const initialState: RequestState = {
  starting: false,
}

function inputPorts(node: ResolvedNode): Readonly<Record<string, InputPortDefinition>> {
  switch (node.kind) {
    case 'condition':
      return { [node.node.input.handle]: node.node.input }
    case 'subflow':
      return node.definition?.inputs ?? {}
    case 'task':
      return node.definition?.inputs ?? {}
    case 'value':
      return {}
  }
}

function nodeTitle(node: ResolvedNode): string {
  if (node.node.name != null) return node.node.name
  if (node.kind == 'task' || node.kind == 'subflow') return node.definition?.name ?? node.id
  return node.id
}

async function inputGroups(draft: Draft, flowId: string, language: ReadonlyVal<string>): Promise<readonly RunInputGroup[]> {
  const { FlowRunInputEditorStore } = await import('../../flowRunInputEditorStore.ts')
  const revision = revisionView(draft)
  const graph = revision.graph({ id: flowId, kind: 'flow' })
  if (graph == null) return []
  return Object.entries(graph.nodes)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([nodeId, node]) => {
      const resolved = revision.resolveNode(nodeId, node)
      if (resolved.kind == 'trigger') return []
      const definitions = Object.entries(inputPorts(resolved))
        .filter(([handle, port]) => resolved.node.inputs[handle] == null && !Object.hasOwn(port, 'value'))
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([handle, port]) =>
          Object.assign({ handle, jsonSchema: port.jsonSchema, nullable: port.nullable }, port.description == null ? {} : { description: port.description }),
        )
      return definitions.length == 0 ? [] : [{ editor: new FlowRunInputEditorStore(definitions, language), nodeId, title: nodeTitle(resolved) }]
    })
}

export class RunRequestStore {
  readonly #client: Client
  readonly #identity: () => string
  readonly #i18n: I18n
  readonly #lifetime = new Latest()
  readonly #requests = new Latest()
  readonly #runs: Pick<RunStore, 'follow' | 'prepareStart'>
  readonly #setNotice: SetNotice
  readonly #state: Val<RequestState> = val(initialState)
  #attempt?: { readonly key: string; readonly signature: string }

  public readonly $: RunRequest$

  public constructor(
    client: Client,
    runs: Pick<RunStore, 'follow' | 'prepareStart'>,
    setNotice: SetNotice,
    i18n: I18n = createI18n(),
    identity: () => string = () => crypto.randomUUID(),
  ) {
    this.#client = client
    this.#runs = runs
    this.#setNotice = setNotice
    this.#i18n = i18n
    this.#identity = identity
    this.$ = {
      inputRequest: derive(this.#state, (state) => state.inputRequest),
      starting: derive(this.#state, (state) => state.starting),
      submitting: derive(this.#state, (state) => state.submitting),
    }
  }

  public dispose(): void {
    this.#lifetime.invalidate()
    this.#requests.invalidate()
    this.#disposeInputRequest()
    for (const value of Object.values(this.$)) value.dispose()
    this.#state.dispose()
  }

  public reset(): void {
    this.#lifetime.invalidate()
    this.#requests.invalidate()
    this.#attempt = undefined
    const request = this.#state.value.inputRequest
    this.#state.set(initialState)
    this.#disposeInputRequest(request)
  }

  public async requestDraft(projectId: string, flow: Flow, draft: Draft): Promise<RunRequestOutcome> {
    if (flow.draft == null) return 'unavailable'
    const current = this.#requests.begin()
    return await this.#request('draft', projectId, flow, draft, flow.draft.revisionId, current)
  }

  public async requestLive(projectId: string, flow: Flow): Promise<RunRequestOutcome> {
    const revisionId = flow.live?.publication.revisionId
    if (revisionId == null) return 'unavailable'
    const current = this.#requests.begin()
    this.#setNotice(undefined)
    this.#set({ starting: true })
    try {
      const revision = await this.#client.getRevision(projectId, revisionId)
      if (!current()) return 'unavailable'
      return await this.#request('live', projectId, flow, revision, revisionId, current)
    } catch (error) {
      if (current()) this.#setNotice(errorNotice(error, this.#i18n.t))
      return 'unavailable'
    } finally {
      if (current()) this.#set({ starting: false })
    }
  }

  public dismissInputs(): void {
    const request = this.#state.value.inputRequest
    this.#set({ inputRequest: undefined })
    this.#disposeInputRequest(request)
  }

  public async confirmInputs(): Promise<boolean> {
    const request = this.#state.value.inputRequest
    if (request == null) return false
    if (!request.valid.value) {
      this.#set({ inputRequest: { ...request, attempted: true } })
      return false
    }
    const inputs = Object.fromEntries(request.groups.map((group) => [group.nodeId, group.editor.values()])) as Readonly<
      Record<string, Readonly<Record<string, JsonValue>>>
    >
    const started = await this.#start(request.source, request.projectId, request.flow, request.revisionId, inputs)
    if (started && this.#state.value.inputRequest === request) this.dismissInputs()
    return started
  }

  async #request(source: RunSource, projectId: string, flow: Flow, revision: Draft, revisionId: string, current: Current): Promise<RunRequestOutcome> {
    const previous = this.#state.value.inputRequest
    this.#set({ inputRequest: undefined, starting: true, submitting: source })
    this.#disposeInputRequest(previous)
    let groups: readonly RunInputGroup[]
    try {
      groups = await inputGroups(revision, flow.flowId, this.#i18n.lang$)
    } catch (error) {
      if (current()) this.#set({ starting: false, submitting: undefined })
      throw error
    }
    if (!current()) {
      for (const group of groups) group.editor.dispose()
      return 'unavailable'
    }
    if (groups.length == 0) return (await this.#start(source, projectId, flow, revisionId)) ? 'started' : 'unavailable'
    const valid = compute((get) => groups.every((group) => get(group.editor.valid$)))
    this.#set({ inputRequest: { attempted: false, flow, groups, projectId, revisionId, source, valid }, starting: false, submitting: undefined })
    return 'input'
  }

  async #start(
    source: RunSource,
    projectId: string,
    flow: Flow,
    revisionId: string,
    inputs: Readonly<Record<string, Readonly<Record<string, JsonValue>>>> = {},
  ): Promise<boolean> {
    if ((source == 'draft' && flow.draft == null) || (source == 'live' && flow.live == null)) return false
    const alive = this.#lifetime.capture()
    const current = this.#runs.prepareStart()
    this.#setNotice(undefined)
    this.#set({ starting: true, submitting: source })
    const target = source == 'draft' ? { flowId: flow.flowId, projectId, revisionId } : { publicationId: flow.live!.publication.publicationId }
    const signature = JSON.stringify({ inputs, source, ...target })
    const attempt = this.#attempt?.signature == signature ? this.#attempt : { key: this.#identity(), signature }
    this.#attempt = attempt
    try {
      const run =
        source == 'draft'
          ? await this.#client.createDraftRun(projectId, revisionId, flow.flowId, { idempotencyKey: attempt.key, inputs })
          : await this.#client.createLiveRun(flow.live!.publication.publicationId, { idempotencyKey: attempt.key, inputs })
      if (!alive() || !current()) return false
      this.#attempt = undefined
      return this.#runs.follow(run, current)
    } catch (error) {
      if (alive() && current()) this.#setNotice(errorNotice(error, this.#i18n.t))
      return false
    } finally {
      if (alive()) this.#set({ starting: false, submitting: undefined })
    }
  }

  #disposeInputRequest(request: RunInputRequest | undefined = this.#state.value.inputRequest): void {
    if (request == null) return
    request.valid.dispose()
    for (const group of request.groups) group.editor.dispose()
  }

  #set(patch: Partial<RequestState>): void {
    this.#state.set({ ...this.#state.value, ...patch })
  }
}
