import type { ConnectorAction, ConnectorConnection, ConnectorProvider, ProjectChangeEvent } from '@oomol-lab/open-flow/control-api'
import type { ChangeOperation, JsonValue, RevisionContent, TriggerKeySnapshot } from '@oomol-lab/open-flow/project-change'
import type { RunStatus } from '@oomol-lab/open-flow/run-lifecycle'
import type { FlowRunOptions } from '@oomol-lab/open-flow/scheduler'
import type { ConnectorHost } from './connector.ts'
import type { PublicationAcceptance, StoredControlRun, StoredPresentation, StoredProject, StoredProjectRevision, StoredPublication } from './store.ts'
import type { StoredTriggerActivity, StoredTriggerBinding } from './trigger-store.ts'

import { controlErrorCode } from '@oomol-lab/open-flow/control-api'
import { applyProjectChanges } from '@oomol-lab/open-flow/project-change'
import { canonicalJsonBytes, digestBytes, encodeRevision } from '@oomol-lab/open-flow/project-encoding'
import { flowClosure, prepareFlow, validateFlow, validateFlowInputs } from '@oomol-lab/open-flow/project-semantics'
import { currentEngineContract, findEngineContract } from '@oomol-lab/open-flow/runtime-contract'
import { randomUUID } from 'node:crypto'
import { ConnectorTaskError } from './connector.ts'
import { AcceptanceError, ControlError, serverErrorCode } from './error.ts'
import { Store } from './store.ts'

type RunInputs = NonNullable<FlowRunOptions['inputs']>
type PublishInput = {
  readonly control:
    | { readonly actorId: string; readonly operation: 'publish' }
    | { readonly actorId: string; readonly operation: 'rollback'; readonly sourcePublicationId: string }
  readonly engineContract: string
  readonly expectedLivePublicationId: string | null
  readonly flowId: string
  readonly idempotencyKey: string
  readonly projectId: string
  readonly revision: RevisionContent
  readonly revisionId: string
}

interface Project {
  readonly createdAt: string
  readonly draftRevisionId: string
  readonly name: string
  readonly projectId: string
  readonly status: 'active' | 'retiring'
  readonly updatedAt: string
  readonly version: 1
}

interface RevisionMetadata {
  readonly actorId: string
  readonly createdAt: string
  readonly digest: string
  readonly modelVersion: number
  readonly parentRevisionId: string | null
  readonly projectId: string
  readonly revisionId: string
  readonly version: 1
}

interface Draft extends RevisionMetadata {
  readonly content: RevisionContent
}

interface DraftFlow {
  readonly closureDigest: string
  readonly flowId: string
  readonly name: string
}

interface DraftChange {
  readonly draftFlows: readonly DraftFlow[]
  readonly revision: RevisionMetadata
  readonly version: 1
}

interface Publication {
  readonly actorId: string
  readonly closureDigest: string
  readonly createdAt: string
  readonly engineContract: string
  readonly flowId: string
  readonly modelVersion: number
  readonly operation: 'publish' | 'rollback'
  readonly projectId: string
  readonly publicationId: string
  readonly revisionDigest: string
  readonly revisionId: string
  readonly sourcePublicationId?: string
  readonly version: 1
}

interface Live {
  readonly flowId: string
  readonly hasUnpublishedChanges: boolean
  readonly projectId: string
  readonly publication: Publication | null
  readonly revision: number
  readonly status: 'not-published' | 'runnable' | 'suspended'
  readonly version: 1
}

interface Flow {
  readonly draft: {
    readonly closureDigest: string
    readonly name: string
    readonly revisionDigest: string
    readonly revisionId: string
  } | null
  readonly flowId: string
  readonly hasUnpublishedChanges: boolean
  readonly live: {
    readonly publication: Publication
    readonly revision: number
    readonly status: 'runnable' | 'suspended'
  } | null
}

interface FlowCheck {
  readonly closureDigest: string
  readonly diagnostics: readonly { readonly code: string; readonly column: number; readonly line: number; readonly message: string; readonly path: string }[]
  readonly engineContract: string
  readonly flowId: string
  readonly modelVersion: number
  readonly projectId: string
  readonly revisionDigest: string
  readonly revisionId: string
  readonly valid: boolean
  readonly version: 1
}

interface Run {
  readonly createdAt: string
  readonly finishedAt?: string
  readonly flowId: string
  readonly projectId: string
  readonly revisionId: string
  readonly runId: string
  readonly source: 'draft' | 'live' | 'trigger'
  readonly startedAt?: string
  readonly status: RunStatus
  readonly version: 1
}

interface RunDetailsBase extends Run {
  readonly closureDigest: string
  readonly engineContract: string
  readonly engineDigest: string
  readonly modelVersion: number
  readonly revisionDigest: string
}

type RunDetails =
  | (RunDetailsBase & { readonly source: 'draft' })
  | (RunDetailsBase & { readonly publicationId: string; readonly source: 'live' })
  | (RunDetailsBase & {
      readonly occurrenceId: string
      readonly publicationId: string
      readonly source: 'trigger'
      readonly triggerNodeId: string
    })

interface RunEvents {
  readonly done: boolean
  readonly events: readonly {
    readonly createdAt: string
    readonly kind: string
    readonly payload: Readonly<Record<string, JsonValue>>
    readonly sequence: number
  }[]
  readonly historyComplete: boolean
  readonly nextAfter: number
  readonly runId: string
  readonly version: 1
}

interface RunCancellation {
  readonly cancelAccepted: boolean
  readonly runId: string
  readonly status: Extract<RunStatus, 'canceled' | 'completed' | 'failed' | 'indeterminate'>
  readonly version: 1
}

type RunResult =
  | { readonly finishedAt: string; readonly result: JsonValue; readonly runId: string; readonly status: 'completed'; readonly version: 1 }
  | {
      readonly error: { readonly code: string; readonly message: string }
      readonly finishedAt: string
      readonly runId: string
      readonly status: 'failed' | 'indeterminate'
      readonly version: 1
    }
  | { readonly finishedAt: string; readonly runId: string; readonly status: 'canceled'; readonly version: 1 }

interface Presentation {
  readonly revision: number
  readonly updatedAt: string
  readonly value: Readonly<Record<string, JsonValue>>
  readonly version: 1
}

interface TriggerKeySummary {
  readonly description: string
  readonly displayName: string
  readonly key: string
  readonly name: string
  readonly provider: string
  readonly type: TriggerKeySnapshot['type']
}

interface TriggerBinding {
  readonly currentPublicationId?: string
  readonly currentRevisionId?: string
  readonly endpointUrl?: string
  readonly flowId: string
  readonly health: StoredTriggerBinding['health']
  readonly kind: StoredTriggerBinding['kind']
  readonly lastErrorCode?: string
  readonly operatorState: StoredTriggerBinding['operatorState']
  readonly projectId: string
  readonly runtimeVersion: number
  readonly triggerNodeId: string
  readonly updatedAt: string
  readonly version: 1
}

interface TriggerActivity {
  readonly activityId: string
  readonly createdAt: string
  readonly errorCode?: string
  readonly errorMessage?: string
  readonly kind: StoredTriggerActivity['kind']
}

export interface TriggerActivityPosition {
  readonly activityId: string
  readonly createdAt: number
}

type PollTriggerTestResult = {
  readonly events: readonly Readonly<Record<string, JsonValue>>[]
  readonly filtered: number
  readonly hasMore: boolean
  readonly version: 1
}

export interface ProjectPosition {
  readonly createdAt: number
  readonly projectId: string
}

export interface RunPosition {
  readonly createdAt: number
  readonly runId: string
}

export interface PublicationPosition {
  readonly createdAt: number
  readonly publicationId: string
}

export class ControlService {
  constructor(
    private readonly store: Store,
    private readonly clock: () => number,
    private readonly abortRun: (runId: string) => void,
    private readonly wake: () => void,
    private readonly publish: (input: PublishInput) => Promise<PublicationAcceptance>,
    private readonly triggersChanged: () => void,
    private readonly triggerDefinitions: readonly TriggerKeySnapshot[],
    private readonly testPollTrigger: (projectId: string, flowId: string, triggerNodeId: string) => Promise<PollTriggerTestResult>,
    private readonly projectChanged: (event: ProjectChangeEvent) => void,
    private readonly connector?: ConnectorHost,
    private readonly connectorConsoleOrigin?: URL,
  ) {}

  listTriggerKeys(): readonly TriggerKeySummary[] {
    return this.triggerDefinitions.map(({ description, displayName, key, name, provider, type }) => ({ description, displayName, key, name, provider, type }))
  }

  listTriggerDefinitions(): readonly TriggerKeySnapshot[] {
    return this.triggerDefinitions
  }

  getTriggerKey(key: string): TriggerKeySnapshot {
    const definition = this.triggerDefinitions.find((candidate) => candidate.key == key)
    if (definition == null) throw new ControlError(controlErrorCode.triggerKeyNotFound, 'The Trigger Key was not found.')
    return definition
  }

  async listConnectorProviders(projectId: string): Promise<readonly ConnectorProvider[]> {
    return await this.#connectorRequest(projectId, (connector) => connector.listProviders())
  }

  async listConnectorActions(projectId: string, serviceId?: string): Promise<readonly ConnectorAction[]> {
    return await this.#connectorRequest(projectId, (connector) => connector.listActions(serviceId))
  }

  async searchConnectorActions(projectId: string, query: string): Promise<readonly ConnectorAction[]> {
    return await this.#connectorRequest(projectId, (connector) => connector.searchActions(query))
  }

  async getConnectorAction(projectId: string, actionId: string): Promise<ConnectorAction> {
    return await this.#connectorRequest(projectId, (connector) => connector.getAction(actionId))
  }

  async listConnectorConnections(projectId: string, serviceId: string): Promise<readonly ConnectorConnection[]> {
    return await this.#connectorRequest(projectId, (connector) => connector.listConnections(serviceId))
  }

  connectorConnectionPage(projectId: string, serviceId: string): string {
    this.getProject(projectId)
    if (this.connectorConsoleOrigin == null) throw new ControlError(controlErrorCode.connectorUnavailable, 'The Connector request could not be completed.')
    return new URL(`providers/${encodeURIComponent(serviceId)}`, this.connectorConsoleOrigin).href
  }

  async #connectorRequest<Value>(projectId: string, request: (connector: ConnectorHost) => Promise<Value>): Promise<Value> {
    this.getProject(projectId)
    if (this.connector == null) throw new ControlError(controlErrorCode.connectorUnavailable, 'The Connector request could not be completed.')
    try {
      return await request(this.connector)
    } catch (error) {
      if (!(error instanceof ConnectorTaskError)) throw error
      throw new ControlError(error.code, error.message)
    }
  }

  async createProject(actorId: string, name: string, idempotencyKey: string): Promise<{ readonly created: boolean; readonly project: Project }> {
    const content = emptyRevision()
    const bytes = encodeRevision(content)
    const createdAt = this.clock()
    const stored = this.store.createProject({
      actorId,
      content: new TextDecoder().decode(bytes),
      createdAt,
      digest: await digestBytes(bytes),
      idempotencyKey,
      name,
      projectId: identity('project'),
      requestDigest: await digestBytes(canonicalJsonBytes({ name })),
      revisionId: identity('revision'),
    })
    if ('kind' in stored) throw new ControlError(controlErrorCode.projectConflict, 'The idempotency key refers to another Project request.')
    return { created: stored.created, project: project(stored.project) }
  }

  listProjects(
    limit: number,
    after?: ProjectPosition,
    includeTotal = false,
  ): {
    readonly next?: ProjectPosition
    readonly page: { readonly projects: readonly Project[]; readonly total?: number; readonly version: 1 }
  } {
    const stored = this.store.listProjects(limit + 1, after, includeTotal)
    const rows = stored.projects.slice(0, limit)
    const last = rows.at(-1)
    return {
      ...(stored.projects.length > limit && last != null ? { next: { createdAt: last.createdAt, projectId: last.projectId } } : {}),
      page: {
        projects: rows.map(project),
        ...(stored.total == null ? {} : { total: stored.total }),
        version: 1,
      },
    }
  }

  getProject(projectId: string): Project {
    const stored = this.store.project(projectId)
    if (stored == null) notFound()
    return project(stored)
  }

  retireProject(projectId: string): Project {
    const stored = this.store.retireProject(projectId, this.clock())
    if (stored == null) notFound()
    this.triggersChanged()
    return project(stored)
  }

  getDraft(projectId: string): Draft {
    return draft(this.requireDraft(projectId))
  }

  getRevision(projectId: string, revisionId: string): Draft {
    const stored = this.store.revision(projectId, revisionId)
    if (stored == null) notFound()
    return draft(stored)
  }

  async syncDraft(
    projectId: string,
  ): Promise<{ readonly draft: Draft; readonly draftFlows: readonly DraftFlow[]; readonly kind: 'snapshot'; readonly version: 1 }> {
    const current = this.requireDraft(projectId)
    const content = revisionContent(current)
    return { draft: draft(current), draftFlows: await projectFlows(content), kind: 'snapshot', version: 1 }
  }

  async changeDraft(actorId: string, projectId: string, expectedRevisionId: string, operations: readonly ChangeOperation[]): Promise<DraftChange> {
    const base = this.requireDraft(projectId)
    if (base.revisionId != expectedRevisionId) throw new ControlError(controlErrorCode.projectRevisionConflict, 'The Draft changed.')
    let content: RevisionContent
    let bytes: Uint8Array
    try {
      content = applyProjectChanges(revisionContent(base), operations)
      bytes = encodeRevision(content)
    } catch {
      invalidProject('The Draft change is invalid.')
    }
    const digest = await digestBytes(bytes)
    if (digest == base.digest) invalidProject('The Draft change does not modify the Project.')
    const stored = this.store.commitRevision({
      actorId,
      content: new TextDecoder().decode(bytes),
      createdAt: this.clock(),
      digest,
      expectedRevisionId,
      flowIds: Object.keys(content.document.flows),
      projectId,
      revisionId: identity('revision'),
    })
    switch (stored.kind) {
      case 'busy':
        throw new ControlError(controlErrorCode.projectBusy, 'The Project is retiring.')
      case 'conflict':
        throw new ControlError(controlErrorCode.projectRevisionConflict, 'The Draft changed.')
      case 'not-found':
        return notFound()
      case 'committed':
        this.triggersChanged()
        this.projectChanged({ kind: 'draft.changed', projectId, revisionId: stored.revision.revisionId, version: 1 })
        return { draftFlows: await projectFlows(content), revision: revisionMetadata(stored.revision), version: 1 }
    }
  }

  async listFlows(projectId: string): Promise<readonly Flow[]> {
    const current = this.requireDraft(projectId)
    const content = revisionContent(current)
    const drafts = new Map((await projectFlows(content)).map((flow) => [flow.flowId, flow] as const))
    const lives = new Map(this.store.liveFlows(projectId).map((live) => [live.publication.flowId, live] as const))
    const status = this.getProject(projectId).status
    return [...new Set([...drafts.keys(), ...lives.keys()])].toSorted().map((flowId) => {
      const currentDraft = drafts.get(flowId)
      const currentLive = lives.get(flowId)
      let draftProjection: Flow['draft'] = null
      let liveProjection: Flow['live'] = null
      if (currentDraft != null) {
        draftProjection = {
          closureDigest: currentDraft.closureDigest,
          name: currentDraft.name,
          revisionDigest: current.digest,
          revisionId: current.revisionId,
        }
      }
      if (currentLive != null) {
        liveProjection = {
          publication: publication(currentLive.publication),
          revision: currentLive.revision,
          status: liveStatus(status, currentLive.publication.engineContract),
        }
      }
      return {
        draft: draftProjection,
        flowId,
        hasUnpublishedChanges: currentDraft?.closureDigest != currentLive?.publication.closureDigest,
        live: liveProjection,
      }
    })
  }

  async getLive(projectId: string, flowId: string): Promise<Live> {
    const currentProject = this.getProject(projectId)
    const current = this.requireDraft(projectId)
    const draftFlow = await flowClosure(revisionContent(current), flowId)
    const stored = this.store.live(projectId, flowId)
    if (stored == null) {
      return {
        flowId,
        hasUnpublishedChanges: draftFlow != null,
        projectId,
        publication: null,
        revision: 0,
        status: 'not-published',
        version: 1,
      }
    }
    return {
      flowId,
      hasUnpublishedChanges: draftFlow?.digest != stored.publication.closureDigest,
      projectId,
      publication: publication(stored.publication),
      revision: stored.revision,
      status: liveStatus(currentProject.status, stored.publication.engineContract),
      version: 1,
    }
  }

  listFlowTriggerBindings(projectId: string, flowId: string): readonly TriggerBinding[] {
    this.getProject(projectId)
    return this.store.triggers.listTriggerBindings(projectId, flowId).map((binding) => triggerBinding(binding))
  }

  getFlowTriggerBinding(projectId: string, flowId: string, triggerNodeId: string, endpointOrigin: string): TriggerBinding {
    this.getProject(projectId)
    return triggerBinding(this.requireTriggerBinding(projectId, flowId, triggerNodeId), endpointOrigin)
  }

  changeFlowTriggerState(projectId: string, flowId: string, triggerNodeId: string, operatorState: StoredTriggerBinding['operatorState']): TriggerBinding {
    this.getProject(projectId)
    const changed = this.store.triggers.setTriggerOperatorState(projectId, flowId, triggerNodeId, operatorState, this.clock())
    if (changed == null) triggerNotFound()
    this.triggersChanged()
    return triggerBinding(changed)
  }

  listFlowTriggerActivities(
    projectId: string,
    flowId: string,
    triggerNodeId: string,
    limit: number,
    after?: TriggerActivityPosition,
  ): {
    readonly next?: TriggerActivityPosition
    readonly page: { readonly activities: readonly TriggerActivity[]; readonly version: 1 }
  } {
    this.getProject(projectId)
    const binding = this.requireTriggerBinding(projectId, flowId, triggerNodeId)
    const stored = this.store.triggers.listTriggerActivities(binding.bindingId, limit + 1, this.clock(), after)
    const rows = stored.slice(0, limit)
    const last = rows.at(-1)
    return {
      ...(stored.length > limit && last != null ? { next: { activityId: last.activityId, createdAt: last.createdAt } } : {}),
      page: { activities: rows.map(triggerActivity), version: 1 },
    }
  }

  async testFlowPollTrigger(projectId: string, flowId: string, triggerNodeId: string): Promise<PollTriggerTestResult> {
    this.getProject(projectId)
    const binding = this.requireTriggerBinding(projectId, flowId, triggerNodeId)
    if (binding.kind != 'poll' || binding.currentPublicationId == null) triggerNotFound()
    return await this.testPollTrigger(projectId, flowId, triggerNodeId)
  }

  listPublications(
    projectId: string,
    flowId: string,
    limit: number,
    after?: PublicationPosition,
    includeTotal = false,
  ): {
    readonly next?: PublicationPosition
    readonly page: { readonly publications: readonly Publication[]; readonly total?: number; readonly version: 1 }
  } {
    this.getProject(projectId)
    const stored = this.store.listPublications(projectId, flowId, limit + 1, after, includeTotal)
    const rows = stored.publications.slice(0, limit)
    const last = rows.at(-1)
    return {
      ...(stored.publications.length > limit && last != null ? { next: { createdAt: last.createdAt, publicationId: last.publicationId } } : {}),
      page: {
        publications: rows.map(publication),
        ...(stored.total == null ? {} : { total: stored.total }),
        version: 1,
      },
    }
  }

  async publishFlow(
    actorId: string,
    projectId: string,
    revisionId: string,
    flowId: string,
    engineContract: string,
    expectedLivePublicationId: string | null,
    idempotencyKey: string,
  ): Promise<{ readonly created: boolean; readonly publication: Publication }> {
    if (engineContract != currentEngineContract) throw new ControlError(controlErrorCode.engineUnsupported, 'The Engine Contract is not supported.')
    const revision = this.store.revision(projectId, revisionId)
    if (revision == null) notFound()
    return await this.commitPublication({
      control: { actorId, operation: 'publish' },
      engineContract,
      expectedLivePublicationId,
      flowId,
      idempotencyKey,
      projectId,
      revision: revisionContent(revision),
      revisionId,
    })
  }

  async rollbackFlow(
    actorId: string,
    projectId: string,
    flowId: string,
    sourcePublicationId: string,
    expectedLivePublicationId: string,
    idempotencyKey: string,
  ): Promise<{ readonly created: boolean; readonly publication: Publication }> {
    const source = this.store.publication(projectId, flowId, sourcePublicationId)
    if (source == null) throw new ControlError(controlErrorCode.publicationNotFound, 'The Publication was not found.')
    const revision = this.store.revision(projectId, source.revisionId)
    if (revision == null || revision.digest != source.revisionDigest) {
      throw new ControlError(serverErrorCode.projectRevisionStorageConflict, 'The fixed Revision does not match the Publication.')
    }
    return await this.commitPublication({
      control: { actorId, operation: 'rollback', sourcePublicationId },
      engineContract: source.engineContract,
      expectedLivePublicationId,
      flowId,
      idempotencyKey,
      projectId,
      revision: revisionContent(revision),
      revisionId: source.revisionId,
    })
  }

  getPresentation(projectId: string): Presentation {
    const stored = this.store.presentation(projectId)
    if (stored == null) notFound()
    return presentation(stored)
  }

  updatePresentation(projectId: string, expectedRevision: number, value: Readonly<Record<string, JsonValue>>): Presentation {
    const stored = this.store.updatePresentation(projectId, expectedRevision, value, this.clock())
    switch (stored.kind) {
      case 'busy':
        throw new ControlError(controlErrorCode.projectBusy, 'The Project is retiring.')
      case 'conflict':
        throw new ControlError(controlErrorCode.projectPresentationConflict, 'The Presentation changed.')
      case 'not-found':
        return notFound()
      case 'updated':
        return presentation(stored.presentation)
    }
  }

  async checkFlow(projectId: string, revisionId: string, flowId: string, engineContract: string): Promise<FlowCheck> {
    const engine = findEngineContract(engineContract)
    if (engine == null) throw new ControlError(controlErrorCode.engineUnsupported, 'The Engine Contract is not supported.')
    const stored = this.store.revision(projectId, revisionId)
    if (stored == null) notFound()
    const content = revisionContent(stored)
    const checked = await validateFlow(content, flowId, engine)
    if (checked == null) throw new ControlError(controlErrorCode.flowNotFound, 'The Flow was not found.')
    return {
      closureDigest: checked.closure.digest,
      diagnostics: checked.diagnostics,
      engineContract,
      flowId,
      modelVersion: content.modelVersion,
      projectId,
      revisionDigest: stored.digest,
      revisionId,
      valid: checked.valid,
      version: 1,
    }
  }

  async createDraftRun(
    projectId: string,
    revisionId: string,
    flowId: string,
    engineContract: string,
    inputs: RunInputs,
    idempotencyKey: string,
  ): Promise<{ readonly created: boolean; readonly run: RunDetails }> {
    const requestDigest = await digestBytes(canonicalJsonBytes({ engineContract, flowId, inputs, kind: 'draft', projectId, revisionId }))
    const existing = this.store.runRequest(idempotencyKey)
    if (existing != null) {
      if (existing.requestDigest != requestDigest || existing.projectId != projectId || existing.source != 'draft') {
        throw new ControlError(controlErrorCode.runConflict, 'The idempotency key refers to another Run request.')
      }
      if (existing.status == 'queued' || existing.status == 'starting') this.wake()
      return { created: false, run: runDetails(this.requireRun(projectId, existing.runId)) }
    }
    if (engineContract != currentEngineContract) throw new ControlError(controlErrorCode.engineUnsupported, 'The Engine Contract is not supported.')
    const stored = this.store.revision(projectId, revisionId)
    if (stored == null) notFound()
    const content = revisionContent(stored)
    const fixed = await prepareFlow(content, flowId, engineContract)
    switch (fixed.kind) {
      case 'engine-unsupported':
        throw new ControlError(controlErrorCode.engineUnsupported, 'The Engine Contract is not supported.')
      case 'flow-invalid':
        throw new ControlError(controlErrorCode.flowInvalid, 'The Flow is invalid.')
      case 'flow-not-found':
        throw new ControlError(controlErrorCode.flowNotFound, 'The Flow was not found.')
      case 'prepared':
        break
    }
    if (validateFlowInputs(content, flowId, inputs) != 'valid') throw new ControlError(controlErrorCode.runInvalid, 'The Flow inputs are invalid.')
    const accepted = this.store.acceptControlRun({
      closureDigest: fixed.flow.closureDigest,
      flowId,
      idempotencyKey,
      inputs,
      modelVersion: content.modelVersion,
      projectId,
      requestDigest,
      revisionDigest: stored.digest,
      revisionId,
    })
    switch (accepted.kind) {
      case 'busy':
        throw new ControlError(controlErrorCode.projectBusy, 'The Project is retiring.')
      case 'conflict':
        throw new ControlError(controlErrorCode.runConflict, 'The idempotency key refers to another Run request.')
      case 'not-found':
        return notFound()
      case 'accepted': {
        if (accepted.created) {
          this.projectChanged({ flowId, kind: 'run.created', projectId, runId: accepted.runId, version: 1 })
          this.wake()
        }
        return { created: accepted.created, run: runDetails(this.requireRun(projectId, accepted.runId)) }
      }
    }
  }

  async createLiveRun(
    projectId: string,
    flowId: string,
    inputs: RunInputs,
    idempotencyKey: string,
  ): Promise<{ readonly created: boolean; readonly run: RunDetails }> {
    const requestDigest = await digestBytes(canonicalJsonBytes({ flowId, inputs, kind: 'live', projectId }))
    const existing = this.store.runRequest(idempotencyKey)
    if (existing != null) {
      if (existing.requestDigest != requestDigest || existing.projectId != projectId || existing.source != 'live') {
        throw new ControlError(controlErrorCode.runConflict, 'The idempotency key refers to another Run request.')
      }
      if (existing.status == 'queued' || existing.status == 'starting') this.wake()
      return { created: false, run: runDetails(this.requireRun(projectId, existing.runId)) }
    }

    const currentProject = this.store.project(projectId)
    if (currentProject == null) notFound()
    if (currentProject.status != 'active') throw new ControlError(controlErrorCode.projectBusy, 'The Project is retiring.')
    const live = this.store.live(projectId, flowId)
    if (live == null) throw new ControlError(controlErrorCode.liveNotFound, 'The Flow has no runnable Live Publication.')
    const livePublication = live.publication
    if (findEngineContract(livePublication.engineContract) == null) {
      throw new ControlError(controlErrorCode.engineUnsupported, 'The Engine Contract is not supported.')
    }
    const stored = this.store.revision(projectId, livePublication.revisionId)
    if (stored == null || stored.digest != livePublication.revisionDigest) {
      throw new ControlError(serverErrorCode.projectRevisionStorageConflict, 'The fixed Revision does not match the Publication.')
    }
    const content = revisionContent(stored)
    const fixed = await prepareFlow(content, flowId, livePublication.engineContract)
    switch (fixed.kind) {
      case 'engine-unsupported':
        throw new ControlError(controlErrorCode.engineUnsupported, 'The Engine Contract is not supported.')
      case 'flow-invalid':
        throw new ControlError(controlErrorCode.flowInvalid, 'The Flow is invalid.')
      case 'flow-not-found':
        throw new ControlError(controlErrorCode.liveNotFound, 'The Live Flow is no longer available.')
      case 'prepared':
        break
    }
    const inputsValid = validateFlowInputs(content, flowId, inputs) == 'valid'
    if (!inputsValid) throw new ControlError(controlErrorCode.runInvalid, 'The Flow inputs are invalid.')
    if (fixed.flow.closureDigest != livePublication.closureDigest || content.modelVersion != livePublication.modelVersion) {
      throw new ControlError(serverErrorCode.projectRevisionStorageConflict, 'The fixed Flow does not match the Publication.')
    }
    const accepted = this.store.acceptLiveControlRun({
      closureDigest: livePublication.closureDigest,
      expectedPublicationId: livePublication.publicationId,
      flowId,
      idempotencyKey,
      inputs,
      modelVersion: livePublication.modelVersion,
      projectId,
      requestDigest,
      revisionDigest: livePublication.revisionDigest,
      revisionId: livePublication.revisionId,
    })
    switch (accepted.kind) {
      case 'busy':
        throw new ControlError(controlErrorCode.projectBusy, 'The Project is retiring.')
      case 'conflict':
        throw new ControlError(controlErrorCode.runConflict, 'The idempotency key refers to another Run request.')
      case 'live-not-found':
        throw new ControlError(controlErrorCode.liveNotFound, 'The Live Publication changed before Run admission.')
      case 'not-found':
        return notFound()
      case 'accepted': {
        if (accepted.created) {
          this.projectChanged({ flowId, kind: 'run.created', projectId, runId: accepted.runId, version: 1 })
          this.wake()
        }
        return { created: accepted.created, run: runDetails(this.requireRun(projectId, accepted.runId)) }
      }
    }
  }

  getRun(projectId: string, runId: string): RunDetails {
    return runDetails(this.requireRun(projectId, runId))
  }

  listRuns(
    projectId: string,
    limit: number,
    options: { readonly after?: RunPosition; readonly flowId?: string; readonly status?: RunStatus } = {},
  ): {
    readonly next?: RunPosition
    readonly page: { readonly projectId: string; readonly runs: readonly Run[]; readonly version: 1 }
  } {
    if (this.store.project(projectId) == null) notFound()
    const stored = this.store.listControlRuns(projectId, limit + 1, options)
    const rows = stored.slice(0, limit)
    const last = rows.at(-1)
    return {
      ...(stored.length > limit && last != null ? { next: { createdAt: last.createdAt, runId: last.runId } } : {}),
      page: { projectId, runs: rows.map(run), version: 1 },
    }
  }

  getRunEvents(projectId: string, runId: string, after: number, limit: number): RunEvents {
    const current = this.requireRun(projectId, runId)
    if (current.eventsExpiresAt != null && current.eventsExpiresAt <= this.clock()) {
      throw new ControlError(controlErrorCode.runEventsExpired, 'The Run event history has expired.')
    }
    const stored = this.store.controlEvents(runId, after, limit)
    const events = stored.map((event) => ({
      createdAt: timestamp(event.createdAt),
      kind: event.kind,
      payload:
        event.kind == 'node.output' && event.value !== undefined
          ? { ...event.payload, output: { kind: 'inline' as const, value: event.value } }
          : event.payload,
      sequence: event.sequence,
    }))
    return {
      done: terminal(current.status),
      events,
      ...(current.eventsExpiresAt == null ? {} : { eventsExpiresAt: timestamp(current.eventsExpiresAt) }),
      historyComplete: !current.eventsTruncated,
      nextAfter: events.at(-1)?.sequence ?? after,
      runId,
      version: 1,
    }
  }

  getRunResult(projectId: string, runId: string): RunResult {
    const stored = this.requireRun(projectId, runId)
    if (!terminal(stored.status)) throw new ControlError(controlErrorCode.runNotTerminal, 'The Run is not terminal.')
    if (stored.finishedAt == null) throw new Error('Terminal Run is missing its completion timestamp.')
    const base = { finishedAt: timestamp(stored.finishedAt), runId, version: 1 as const }
    switch (stored.status) {
      case 'canceled':
        return { ...base, status: 'canceled' }
      case 'completed':
        return { ...base, result: stored.result as JsonValue, status: 'completed' }
      case 'failed':
      case 'indeterminate':
        return { ...base, error: runError(stored.result), status: stored.status }
      case 'queued':
      case 'running':
      case 'starting':
        throw new Error('Non-terminal Run passed the terminal guard.')
    }
  }

  cancelRun(projectId: string, runId: string): RunCancellation {
    const canceled = this.store.cancelControlRun(projectId, runId)
    if (canceled == null) runNotFound()
    if (canceled.accepted) this.abortRun(runId)
    return { cancelAccepted: canceled.accepted, runId, status: terminalStatus(canceled.run.status), version: 1 }
  }

  private async commitPublication(input: PublishInput): Promise<{ readonly created: boolean; readonly publication: Publication }> {
    let accepted: PublicationAcceptance
    try {
      accepted = await this.publish(input)
    } catch (error) {
      if (!(error instanceof AcceptanceError)) throw error
      switch (error.code) {
        case 'engine-unsupported':
          throw new ControlError(controlErrorCode.engineUnsupported, error.message)
        case 'flow-not-found':
          throw new ControlError(controlErrorCode.flowNotFound, error.message)
        case 'publication-live-conflict':
          throw new ControlError(controlErrorCode.liveConflict, error.message)
        case 'revision-conflict':
          throw new ControlError(serverErrorCode.projectRevisionStorageConflict, error.message)
        case 'flow-inputs-invalid':
        case 'flow-invalid':
        case 'revision-invalid':
        case 'trigger-invalid':
        case 'trigger-payload-invalid':
          throw new ControlError(controlErrorCode.flowInvalid, error.message)
      }
    }
    switch (accepted.kind) {
      case 'busy':
        throw new ControlError(controlErrorCode.projectBusy, 'The Project is retiring.')
      case 'conflict':
        throw new ControlError(controlErrorCode.publicationConflict, 'The idempotency key refers to another Publication request.')
      case 'live-conflict':
        throw new ControlError(controlErrorCode.liveConflict, 'The Flow Live pointer no longer matches the expected Publication.')
      case 'not-found':
        return notFound()
      case 'revision-conflict':
        throw new ControlError(controlErrorCode.projectRevisionConflict, 'The Draft changed.')
      case 'source-not-found':
        throw new ControlError(controlErrorCode.publicationNotFound, 'The Publication was not found.')
      case 'published': {
        const stored = this.store.publication(input.projectId, input.flowId, accepted.publicationId)
        if (stored == null) throw new Error('Committed Publication is missing.')
        return { created: accepted.created, publication: publication(stored) }
      }
    }
  }

  private requireDraft(projectId: string): StoredProjectRevision {
    const stored = this.store.draft(projectId)
    if (stored == null) notFound()
    return stored
  }

  private requireRun(projectId: string, runId: string): StoredControlRun {
    const stored = this.store.controlRun(projectId, runId)
    if (stored == null) runNotFound()
    return stored
  }

  private requireTriggerBinding(projectId: string, flowId: string, triggerNodeId: string): StoredTriggerBinding {
    const stored = this.store.triggers.triggerBinding(projectId, flowId, triggerNodeId)
    if (stored == null) triggerNotFound()
    return stored
  }
}

function emptyRevision(): RevisionContent {
  return {
    document: { bindings: {}, flows: {}, subflows: {}, tasks: {} },
    modelVersion: 1,
    modules: {},
  }
}

function identity(kind: 'project' | 'revision'): string {
  return `${kind}_${randomUUID().replaceAll('-', '')}`
}

function timestamp(value: number): string {
  return new Date(value).toISOString()
}

function project(stored: StoredProject): Project {
  return {
    createdAt: timestamp(stored.createdAt),
    draftRevisionId: stored.draftRevisionId,
    name: stored.name,
    projectId: stored.projectId,
    status: stored.status,
    updatedAt: timestamp(stored.updatedAt),
    version: 1,
  }
}

function revisionContent(stored: { readonly content: string }): RevisionContent {
  return JSON.parse(stored.content) as RevisionContent
}

function revisionMetadata(stored: StoredProjectRevision): Omit<Draft, 'content'> {
  return {
    actorId: stored.actorId,
    createdAt: timestamp(stored.createdAt),
    digest: stored.digest,
    modelVersion: revisionContent(stored).modelVersion,
    parentRevisionId: stored.parentRevisionId,
    projectId: stored.projectId,
    revisionId: stored.revisionId,
    version: 1,
  }
}

function draft(stored: StoredProjectRevision): Draft {
  return { ...revisionMetadata(stored), content: revisionContent(stored) }
}

async function projectFlows(content: RevisionContent): Promise<readonly DraftFlow[]> {
  return await Promise.all(
    Object.entries(content.document.flows)
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(async ([flowId, flow]) => ({ closureDigest: (await flowClosure(content, flowId))!.digest, flowId, name: flow.name })),
  )
}

function presentation(stored: StoredPresentation): Presentation {
  return { revision: stored.revision, updatedAt: timestamp(stored.updatedAt), value: stored.value, version: 1 }
}

function triggerBinding(stored: StoredTriggerBinding, endpointOrigin?: string): TriggerBinding {
  return {
    ...(stored.currentPublicationId == null ? {} : { currentPublicationId: stored.currentPublicationId }),
    ...(stored.currentRevisionId == null ? {} : { currentRevisionId: stored.currentRevisionId }),
    ...(endpointOrigin == null || stored.currentPublicationId == null || stored.kind != 'webhook' || stored.endpointId == null
      ? {}
      : { endpointUrl: `${endpointOrigin}/v1/webhooks/${stored.endpointId}` }),
    flowId: stored.flowId,
    health: stored.health,
    kind: stored.kind,
    ...(stored.lastErrorCode == null ? {} : { lastErrorCode: stored.lastErrorCode }),
    operatorState: stored.operatorState,
    projectId: stored.projectId,
    runtimeVersion: stored.runtimeVersion,
    triggerNodeId: stored.triggerNodeId,
    updatedAt: timestamp(stored.updatedAt),
    version: 1,
  }
}

function triggerActivity(stored: StoredTriggerActivity): TriggerActivity {
  return {
    activityId: stored.activityId,
    createdAt: timestamp(stored.createdAt),
    ...(stored.errorCode == null ? {} : { errorCode: stored.errorCode }),
    ...(stored.errorMessage == null ? {} : { errorMessage: stored.errorMessage }),
    kind: stored.kind,
  }
}

function run(stored: StoredControlRun): Run {
  return {
    createdAt: timestamp(stored.createdAt),
    ...(stored.eventsExpiresAt == null ? {} : { eventsExpiresAt: timestamp(stored.eventsExpiresAt) }),
    ...(stored.finishedAt == null ? {} : { finishedAt: timestamp(stored.finishedAt) }),
    flowId: stored.flowId,
    projectId: stored.projectId,
    revisionId: stored.revisionId,
    runId: stored.runId,
    source: stored.source,
    ...(stored.startedAt == null ? {} : { startedAt: timestamp(stored.startedAt) }),
    status: stored.status,
    version: 1,
  }
}

function runDetails(stored: StoredControlRun): RunDetails {
  const details = {
    ...run(stored),
    closureDigest: stored.closureDigest,
    engineContract: stored.engineContract,
    engineDigest: stored.engineDigest,
    modelVersion: stored.modelVersion,
    revisionDigest: stored.revisionDigest,
  }
  switch (stored.source) {
    case 'draft':
      return { ...details, source: 'draft' }
    case 'live':
      if (stored.publicationId == null) throw new Error('Live Run is missing its Publication identity.')
      return { ...details, publicationId: stored.publicationId, source: 'live' }
    case 'trigger':
      if (stored.occurrenceId == null || stored.publicationId == null || stored.triggerNodeId == null) {
        throw new Error('Trigger Run is missing its admission identity.')
      }
      return {
        ...details,
        occurrenceId: stored.occurrenceId,
        publicationId: stored.publicationId,
        source: 'trigger',
        triggerNodeId: stored.triggerNodeId,
      }
  }
}

function publication(stored: StoredPublication): Publication {
  return {
    actorId: stored.actorId,
    closureDigest: stored.closureDigest,
    createdAt: timestamp(stored.createdAt),
    engineContract: stored.engineContract,
    flowId: stored.flowId,
    modelVersion: stored.modelVersion,
    operation: stored.operation,
    projectId: stored.projectId,
    publicationId: stored.publicationId,
    revisionDigest: stored.revisionDigest,
    revisionId: stored.revisionId,
    ...(stored.sourcePublicationId == null ? {} : { sourcePublicationId: stored.sourcePublicationId }),
    version: 1,
  }
}

function liveStatus(projectStatus: StoredProject['status'], engineContract: string): 'runnable' | 'suspended' {
  return projectStatus == 'active' && findEngineContract(engineContract) != null ? 'runnable' : 'suspended'
}

function terminal(status: RunStatus): boolean {
  return status == 'canceled' || status == 'completed' || status == 'failed' || status == 'indeterminate'
}

function terminalStatus(status: RunStatus): RunCancellation['status'] {
  if (status == 'canceled' || status == 'completed' || status == 'failed' || status == 'indeterminate') return status
  throw new Error('Canceled Run did not reach a terminal state.')
}

function runError(value: unknown): { readonly code: string; readonly message: string } {
  const candidate = value as { readonly error?: { readonly code?: unknown; readonly message?: unknown } } | undefined
  return {
    code: typeof candidate?.error?.code == 'string' ? candidate.error.code : 'run.failed',
    message: typeof candidate?.error?.message == 'string' ? candidate.error.message : 'The Flow could not be completed.',
  }
}

function invalidProject(message: string): never {
  throw new ControlError(controlErrorCode.projectInvalid, message)
}

function notFound(): never {
  throw new ControlError(controlErrorCode.projectNotFound, 'The Project or Revision was not found.')
}

function runNotFound(): never {
  throw new ControlError(controlErrorCode.runNotFound, 'The Run was not found.')
}

function triggerNotFound(): never {
  throw new ControlError(controlErrorCode.triggerNotFound, 'The Trigger binding was not found.')
}
