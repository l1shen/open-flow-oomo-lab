import type { I18n } from 'val-i18n'
import type { WorkbenchClient, Draft, DraftFlow, Flow, FlowCheck, RevisionMetadata } from '../api.ts'
import type { ProjectChanges } from '../designer/projectChanges.ts'
import type { Current } from './latest.ts'
import type { SetNotice } from './workbenchNotice.ts'

import { ApiError } from '../api.ts'
import { applyProjectChanges } from '../designer/projectChanges.ts'
import { errorNotice } from './workbenchNotice.ts'

export interface DraftChangeContext {
  readonly current: Current
  readonly projectId: string
}

interface PendingChange extends DraftChangeContext {
  changes: ProjectChanges
  result?: Promise<Draft | undefined>
  started: boolean
}

type Hooks = {
  readonly apply: (draft: Draft, flows: readonly Flow[], previousFlows: readonly Flow[], preserveDiagnostics?: boolean) => void
  readonly beforeChange: (manageBusy: boolean) => void
  readonly check: () => void
  readonly current: (context: DraftChangeContext) => boolean
  readonly diagnostics: () => FlowCheck | undefined
  readonly finishChanges: () => void
  readonly flows: () => readonly Flow[]
  readonly headChanged: (projectId: string, revisionId: string) => void
  readonly recover: (context: DraftChangeContext) => Promise<boolean>
}

function replacementKey(changes: ProjectChanges): string | undefined {
  if (changes.length != 1) return
  const change = changes[0]!
  switch (change.kind) {
    case 'binding.replace':
      return `${change.kind}:${change.bindingId}`
    case 'flow.rename':
      return `${change.kind}:${change.flowId}`
    case 'graph.node.replace':
      return `${change.kind}:${change.target.kind}:${change.target.id}:${change.nodeId}`
    case 'module.rename':
    case 'module.source.replace':
      return `${change.kind}:${change.moduleId}`
    case 'subflow.definition.replace':
      return `${change.kind}:${change.subflowId}`
    case 'task.replace':
      return `${change.kind}:${change.taskId}`
    default:
      return
  }
}

export function advanceFlowSummaries(flows: readonly Flow[], draftFlows: readonly DraftFlow[], revision: RevisionMetadata): readonly Flow[] {
  const current = new Map(flows.map((flow) => [flow.flowId, flow]))
  const draft = new Map(draftFlows.map((flow) => [flow.flowId, flow]))
  return [...draft.keys()].toSorted().map((flowId) => {
    const previous = current.get(flowId)
    const nextDraft = draft.get(flowId)!
    const live = previous?.live ?? null
    return {
      draft: {
        closureDigest: nextDraft.closureDigest,
        name: nextDraft.name,
        revisionDigest: revision.digest,
        revisionId: revision.revisionId,
      },
      flowId,
      hasUnpublishedChanges: live == null || live.publication.closureDigest != nextDraft.closureDigest,
      live,
    }
  })
}

export class DraftChanges {
  readonly #client: WorkbenchClient
  readonly #hooks: Hooks
  readonly #i18n: I18n
  readonly #setNotice: SetNotice
  #changes = 0
  #committed?: Draft
  #pending: PendingChange[] = []
  #queue: Promise<void> = Promise.resolve()

  public constructor(client: WorkbenchClient, setNotice: SetNotice, i18n: I18n, hooks: Hooks) {
    this.#client = client
    this.#setNotice = setNotice
    this.#i18n = i18n
    this.#hooks = hooks
  }

  public get committed(): Draft | undefined {
    return this.#committed
  }

  public get changing(): boolean {
    return this.#changes > 0
  }

  public get pendingCount(): number {
    return this.#pending.length
  }

  public reset(draft?: Draft): void {
    this.#committed = draft
    this.#pending = []
    this.#queue = Promise.resolve()
  }

  public replaceCommitted(draft: Draft): void {
    this.#committed = draft
  }

  public project(draft: Draft): Draft {
    return this.#pending.reduce((current, pending) => applyProjectChanges(current, pending.changes), draft)
  }

  public enqueue(task: () => Promise<void>): Promise<void> {
    const queued = this.#queue.then(task)
    this.#queue = queued
    return queued
  }

  public async change(context: DraftChangeContext, draft: Draft, changes: ProjectChanges, manageBusy = true): Promise<Draft | undefined> {
    this.#hooks.beforeChange(manageBusy)
    const flows = this.#hooks.flows()
    this.#hooks.apply(applyProjectChanges(draft, changes), flows, flows)
    const key = replacementKey(changes)
    const tail = this.#pending.at(-1)
    const queued = key != null && tail != null && !tail.started && replacementKey(tail.changes) == key ? tail : undefined
    if (queued != null) {
      queued.changes = changes
      return await queued.result!
    }
    const pending: PendingChange = { ...context, changes, started: false }
    this.#committed ??= draft
    this.#pending.push(pending)
    this.#changes += 1
    const change = this.#queue.then(() => {
      pending.started = true
      return this.#commit(pending)
    })
    pending.result = change
    this.#queue = change.then(() => undefined)
    try {
      return await change
    } finally {
      this.#changes -= 1
      if (this.#changes == 0) this.#hooks.finishChanges()
    }
  }

  async #commit(pending: PendingChange): Promise<Draft | undefined> {
    let recovered = false
    while (this.#hooks.current(pending)) {
      const base = this.#committed
      if (base == null) return
      try {
        const changed = await this.#client.changeDraft(pending.projectId, base.revisionId, pending.changes)
        if (!this.#hooks.current(pending)) return
        if (changed.revision.parentRevisionId != base.revisionId) throw new Error('Invalid Draft change response.')
        const committed = this.#applyCommitted(pending, base, changed)
        if (this.#pending.length == 0) this.#hooks.check()
        return committed
      } catch (error) {
        if (error instanceof ApiError && error.code == 'project.revision-conflict') {
          if (!recovered && (await this.#hooks.recover(pending))) {
            recovered = true
            continue
          }
          if (recovered) await this.#hooks.recover(pending)
          this.#reject(pending)
          if (this.#hooks.current(pending)) {
            this.#setNotice({
              kind: 'error',
              message: this.#i18n.t('notice.draftConflict'),
            })
          }
        } else {
          this.#reject(pending)
          if (this.#hooks.current(pending)) this.#setNotice(errorNotice(error, this.#i18n.t))
        }
        return
      }
    }
  }

  #applyCommitted(pending: PendingChange, base: Draft, change: Awaited<ReturnType<WorkbenchClient['changeDraft']>>): Draft {
    const committed = { ...change.revision, content: applyProjectChanges(base, pending.changes).content }
    this.#pending = this.#pending.filter((candidate) => candidate !== pending)
    this.#committed = committed
    const previousFlows = this.#hooks.flows()
    const flows = advanceFlowSummaries(previousFlows, change.draftFlows, committed)
    const diagnostics = this.#hooks.diagnostics()
    const preserveDiagnostics =
      this.#pending.length == 0 &&
      diagnostics != null &&
      flows.find((flow) => flow.flowId == diagnostics.flowId)?.draft?.closureDigest == diagnostics.closureDigest
    this.#hooks.apply(this.project(committed), flows, previousFlows, preserveDiagnostics)
    this.#hooks.headChanged(pending.projectId, committed.revisionId)
    return committed
  }

  #reject(pending: PendingChange): void {
    this.#pending = this.#pending.filter((candidate) => candidate !== pending)
    if (!this.#hooks.current(pending) || this.#committed == null) return
    const flows = this.#hooks.flows()
    this.#hooks.apply(this.project(this.#committed), flows, flows)
  }
}
