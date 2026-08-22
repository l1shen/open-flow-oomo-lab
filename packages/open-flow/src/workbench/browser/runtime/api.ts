import type { Publication } from '../../../control/common/api.ts'
import type { ChangeOperation, JsonValue, RevisionContent } from '../../../project/common/change.ts'
import type { ProjectChangeEvent, WorkbenchHost } from './contract.ts'

import { ControlClient } from '../../../control/common/api.ts'

export { ApiError } from '../../../control/common/api.ts'
export type {
  DraftRun,
  ConnectorAction,
  ConnectorConnection,
  ConnectorProvider,
  Live,
  LiveRun,
  Publication,
  PublicationPage,
  Project,
  ProjectPage,
  Run,
  RunCancellation,
  RunDetails,
  RunEvent,
  RunEventKind,
  RunEvents,
  RunPage,
  RunResult,
  RunStatus,
  PollTriggerTestResult,
  TriggerActivity,
  TriggerActivityKind,
  TriggerActivityPage,
  TriggerBinding,
  TriggerBindingDetail,
  TriggerRun,
  TriggerKeySummary,
} from '../../../control/common/api.ts'

export type {
  ChangeOperation,
  CodeModule,
  ConditionOperator,
  ConditionNode,
  Graph,
  GraphEdge,
  GraphNode,
  GraphTarget,
  InputMapping,
  InputPortDefinition,
  JsonValue,
  PortDefinition,
  ProjectDocument,
  SubflowNode,
  TaskDefinition,
  TaskNode,
  TriggerKeySnapshot,
  TriggerNode,
  TriggerSchedule,
  ValueNode,
  WebhookOptions,
} from '../../../project/common/change.ts'

export interface RevisionMetadata {
  readonly actorId: string
  readonly createdAt: string
  readonly digest: string
  readonly modelVersion: number
  readonly parentRevisionId: string | null
  readonly projectId: string
  readonly revisionId: string
  readonly version: 1
}

export interface Draft extends RevisionMetadata {
  readonly content: RevisionContent
}

export interface DraftFlow {
  readonly closureDigest: string
  readonly flowId: string
  readonly name: string
}

export interface DraftChange {
  readonly draftFlows: readonly DraftFlow[]
  readonly revision: RevisionMetadata
  readonly version: 1
}

export type DraftSync =
  | {
      readonly draftFlows: readonly DraftFlow[]
      readonly kind: 'changes'
      readonly revisions: readonly { readonly operations: readonly ChangeOperation[]; readonly revision: RevisionMetadata }[]
      readonly version: 1
    }
  | { readonly draft: Draft; readonly draftFlows: readonly DraftFlow[]; readonly kind: 'snapshot'; readonly version: 1 }

export interface Presentation {
  readonly revision: number
  readonly updatedAt: string
  readonly value: Readonly<Record<string, JsonValue>>
  readonly version: 1
}

export interface Diagnostic {
  readonly code: string
  readonly column: number
  readonly line: number
  readonly message: string
  readonly path: string
}

export interface FlowCheck {
  readonly closureDigest: string
  readonly diagnostics: readonly Diagnostic[]
  readonly engineContract: string
  readonly flowId: string
  readonly modelVersion: number
  readonly projectId: string
  readonly revisionDigest: string
  readonly revisionId: string
  readonly valid: boolean
  readonly version: 1
}

export interface Flow {
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

type Fetcher = WorkbenchHost['request']
type ProjectSubscriber = WorkbenchHost['subscribeProject']
type RunCreatedEvent = Extract<ProjectChangeEvent, { readonly kind: 'run.created' }>

const segment = encodeURIComponent

export class WorkbenchClient extends ControlClient {
  constructor(
    fetcher: Fetcher,
    private readonly subscribeProject: ProjectSubscriber = () => () => {},
  ) {
    super(fetcher)
  }

  watchProject(projectId: string, changed: (revisionId?: string) => void, runCreated: (event: RunCreatedEvent) => void = () => {}): () => void {
    return this.subscribeProject(projectId, (event?: ProjectChangeEvent) => {
      if (event == null) changed()
      else if (event.kind == 'draft.changed') changed(event.revisionId)
      else runCreated(event)
    })
  }

  async getPresentation(projectId: string): Promise<Presentation> {
    return await this.request(`/v1/projects/${segment(projectId)}/presentation`)
  }

  async updatePresentation(projectId: string, expectedRevision: number, value: Readonly<Record<string, JsonValue>>): Promise<Presentation> {
    return await this.request(`/v1/projects/${segment(projectId)}/presentation`, {
      body: JSON.stringify({ expectedRevision, value, version: 1 }),
      method: 'PUT',
    })
  }
}
