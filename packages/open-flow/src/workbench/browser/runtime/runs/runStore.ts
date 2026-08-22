import type { I18n } from 'val-i18n'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { WorkbenchClient, Run, RunEvent, RunResult } from '../api.ts'
import type { Current } from '../stores/latest.ts'
import type { SetNotice } from '../stores/workbenchNotice.ts'

import { derive, val } from 'value-enhancer'
import { isRunTerminal } from '../../../../execution/common/runLifecycle.ts'
import { ApiError } from '../api.ts'
import { createI18n } from '../i18n.ts'
import { Latest } from '../stores/latest.ts'
import { errorNotice } from '../stores/workbenchNotice.ts'

interface RunState {
  readonly cancelingRunId?: string
  readonly eventCursor: number
  readonly eventFilter: RunEventFilter
  readonly events: readonly RunEvent[]
  readonly eventsExpiresAt?: string
  readonly externalRunId?: string
  readonly historyComplete: boolean
  readonly loadFailed: boolean
  readonly loading: boolean
  readonly loadMoreFailed: boolean
  readonly loadingMore: boolean
  readonly nextCursor?: string
  readonly observationFailed: boolean
  readonly result?: RunResult
  readonly run?: Run
  readonly runs: readonly Run[]
  readonly target?: { readonly flowId?: string; readonly projectId: string }
}

type Client = Pick<WorkbenchClient, 'cancelRun' | 'getRun' | 'getRunEvents' | 'getRunResult' | 'listRuns'>

export interface Run$ {
  readonly cancelingRunId: ReadonlyVal<string | undefined>
  readonly eventFilter: ReadonlyVal<RunEventFilter>
  readonly events: ReadonlyVal<readonly RunEvent[]>
  readonly eventsExpiresAt: ReadonlyVal<string | undefined>
  readonly externalRunId: ReadonlyVal<string | undefined>
  readonly historyComplete: ReadonlyVal<boolean>
  readonly loadFailed: ReadonlyVal<boolean>
  readonly loading: ReadonlyVal<boolean>
  readonly loadMoreFailed: ReadonlyVal<boolean>
  readonly loadingMore: ReadonlyVal<boolean>
  readonly nextCursor: ReadonlyVal<string | undefined>
  readonly observationFailed: ReadonlyVal<boolean>
  readonly result: ReadonlyVal<RunResult | undefined>
  readonly run: ReadonlyVal<Run | undefined>
  readonly runs: ReadonlyVal<readonly Run[]>
}

export type RunEventFilter = 'all' | 'artifact' | 'lifecycle' | 'log' | 'output' | 'progress'

const initialState: RunState = {
  eventCursor: 0,
  eventFilter: 'all',
  events: [],
  historyComplete: true,
  loadFailed: false,
  loading: false,
  loadMoreFailed: false,
  loadingMore: false,
  observationFailed: false,
  runs: [],
}

const eventPageLimit = 100
const startingPollDelay = 500
const runningPollDelay = 1200

export function canCancelRun(run: Run | undefined): run is Run & { readonly status: 'queued' | 'running' | 'starting' } {
  return run?.status == 'queued' || run?.status == 'starting' || run?.status == 'running'
}

export class RunStore {
  readonly #cancellation = new Latest()
  readonly #client: Client
  readonly #i18n: I18n
  readonly #lists = new Latest()
  readonly #selection = new Latest()
  readonly #setNotice: SetNotice
  readonly #state: Val<RunState> = val(initialState)
  #timer?: ReturnType<typeof globalThis.setTimeout>

  public readonly $: Run$

  public constructor(client: Client, setNotice: SetNotice, i18n: I18n = createI18n()) {
    this.#client = client
    this.#i18n = i18n
    this.#setNotice = setNotice
    this.$ = {
      cancelingRunId: derive(this.#state, (state) => state.cancelingRunId),
      eventFilter: derive(this.#state, (state) => state.eventFilter),
      events: derive(this.#state, (state) => state.events),
      eventsExpiresAt: derive(this.#state, (state) => state.eventsExpiresAt),
      externalRunId: derive(this.#state, (state) => state.externalRunId),
      historyComplete: derive(this.#state, (state) => state.historyComplete),
      loadFailed: derive(this.#state, (state) => state.loadFailed),
      loading: derive(this.#state, (state) => state.loading),
      loadMoreFailed: derive(this.#state, (state) => state.loadMoreFailed),
      loadingMore: derive(this.#state, (state) => state.loadingMore),
      nextCursor: derive(this.#state, (state) => state.nextCursor),
      observationFailed: derive(this.#state, (state) => state.observationFailed),
      result: derive(this.#state, (state) => state.result),
      run: derive(this.#state, (state) => state.run),
      runs: derive(this.#state, (state) => state.runs),
    }
  }

  public dispose(): void {
    this.#cancellation.invalidate()
    this.#lists.invalidate()
    this.#selection.invalidate()
    this.#clearTimer()
    for (const value of Object.values(this.$)) value.dispose()
    this.#state.dispose()
  }

  public reset(): void {
    this.#cancellation.invalidate()
    this.#lists.invalidate()
    this.#selection.invalidate()
    this.#clearTimer()
    this.#state.set(initialState)
  }

  public async load(projectId: string, flowId?: string): Promise<void> {
    const current = this.#lists.begin()
    this.#selection.invalidate()
    this.#clearTimer()
    this.#setNotice(undefined)
    const state = this.#state.value
    const cancelingRunId = state.run?.projectId == projectId ? state.cancelingRunId : undefined
    if (state.cancelingRunId != null && cancelingRunId == null) this.#cancellation.invalidate()
    this.#state.set({
      ...initialState,
      ...(cancelingRunId == null ? {} : { cancelingRunId }),
      eventFilter: state.eventFilter,
      loading: true,
      target: { ...(flowId == null ? {} : { flowId }), projectId },
    })
    try {
      const page = await this.#client.listRuns(projectId, { ...(flowId == null ? {} : { flowId }), limit: 50 })
      if (!current()) return
      this.#set({ loadFailed: false, loading: false, nextCursor: page.nextCursor, runs: page.runs })
      const first = page.runs[0]
      if (first != null) this.#observe(first)
    } catch (error) {
      if (!current()) return
      this.#set({ loadFailed: true, loading: false })
      this.#setNotice(errorNotice(error, this.#i18n.t))
    }
  }

  public async loadMore(): Promise<void> {
    const { loadingMore, nextCursor, target } = this.#state.value
    if (loadingMore || nextCursor == null || target == null) return
    const current = this.#lists.capture()
    this.#set({ loadMoreFailed: false, loadingMore: true })
    try {
      const page = await this.#client.listRuns(target.projectId, {
        cursor: nextCursor,
        ...(target.flowId == null ? {} : { flowId: target.flowId }),
        limit: 50,
      })
      if (!current()) return
      const seen = new Set(this.#state.value.runs.map((run) => run.runId))
      this.#set({
        loadingMore: false,
        loadMoreFailed: false,
        nextCursor: page.nextCursor,
        runs: [...this.#state.value.runs, ...page.runs.filter((run) => !seen.has(run.runId))],
      })
    } catch (error) {
      if (!current()) return
      this.#set({ loadMoreFailed: true, loadingMore: false })
      this.#setNotice(errorNotice(error, this.#i18n.t))
    }
  }

  public select(runId: string): void {
    const run = this.#state.value.runs.find((candidate) => candidate.runId == runId)
    if (run != null && run.runId != this.#state.value.run?.runId) this.#observe(run)
  }

  public async retryLoad(): Promise<void> {
    const target = this.#state.value.target
    if (target != null) await this.load(target.projectId, target.flowId)
  }

  public retryObservation(): void {
    const run = this.#state.value.run
    if (run == null) return
    const current = this.#selection.begin()
    this.#clearTimer()
    this.#set({ observationFailed: false })
    void this.#poll(run, current)
  }

  public setEventFilter(filter: RunEventFilter): void {
    this.#set({ eventFilter: filter })
  }

  public async cancel(): Promise<void> {
    const run = this.#state.value.run
    if (!canCancelRun(run) || this.#state.value.cancelingRunId != null) return
    const current = this.#cancellation.begin()
    this.#setNotice(undefined)
    this.#set({ cancelingRunId: run.runId })
    try {
      const cancellation = await this.#client.cancelRun(run.projectId, run.runId)
      if (!current()) return
      const state = this.#state.value
      const selected = state.run?.runId == run.runId
      const selectedRun = selected ? { ...state.run!, status: cancellation.status } : undefined
      this.#set({
        ...(selectedRun == null ? {} : { run: selectedRun }),
        runs: state.runs.map((candidate) => (candidate.runId == run.runId ? Object.assign({}, candidate, { status: cancellation.status }) : candidate)),
      })
      if (selectedRun == null) return
      const observation = this.#selection.begin()
      this.#clearTimer()
      await this.#poll(selectedRun, observation)
    } catch (error) {
      if (current()) this.#setNotice(errorNotice(error, this.#i18n.t))
    } finally {
      if (current() && this.#state.value.cancelingRunId == run.runId) this.#set({ cancelingRunId: undefined })
    }
  }

  public prepareStart(): Current {
    const current = this.#selection.begin()
    this.#lists.invalidate()
    this.#clearTimer()
    this.#set({ eventCursor: 0, events: [], eventsExpiresAt: undefined, historyComplete: true, result: undefined, run: undefined })
    return current
  }

  public follow(run: Run, current: Current): boolean {
    if (!current()) return false
    this.#set({
      events: [],
      externalRunId: undefined,
      result: undefined,
      run,
      runs: [run, ...this.#state.value.runs.filter((candidate) => candidate.runId != run.runId)],
      target: { flowId: run.flowId, projectId: run.projectId },
    })
    void this.#poll(run, current)
    return true
  }

  public followExternal(run: Run): boolean {
    if (this.#state.value.run?.runId == run.runId) return false
    const current = this.prepareStart()
    if (!this.follow(run, current)) return false
    this.#set({ externalRunId: run.runId })
    return true
  }

  #observe(run: Run): void {
    const current = this.#selection.begin()
    this.#clearTimer()
    this.#set({ eventCursor: 0, events: [], eventsExpiresAt: undefined, historyComplete: true, observationFailed: false, result: undefined, run })
    void this.#poll(run, current)
  }

  async #poll(run: Run, current: Current, unchangedStartingPolls = 0): Promise<void> {
    try {
      const after = this.#state.value.eventCursor
      const [runResponse, eventsResponse] = await Promise.allSettled([
        this.#client.getRun(run.projectId, run.runId),
        this.#client.getRunEvents(run.projectId, run.runId, { after, limit: eventPageLimit }),
      ])
      if (runResponse.status == 'rejected') throw runResponse.reason
      if (!current() || this.#state.value.run?.runId != run.runId) return
      const nextRun = runResponse.value
      this.#set({ observationFailed: false })
      if (eventsResponse.status == 'rejected') {
        if (!(eventsResponse.reason instanceof ApiError) || eventsResponse.reason.code != 'run.events-expired') throw eventsResponse.reason
        this.#set({
          eventsExpiresAt: undefined,
          historyComplete: false,
          run: nextRun,
          runs: this.#state.value.runs.map((candidate) => (candidate.runId == nextRun.runId ? nextRun : candidate)),
        })
        await this.#loadResult(nextRun, current)
        return
      }
      const page = eventsResponse.value
      this.#set({
        eventCursor: page.nextAfter,
        events: [...this.#state.value.events, ...page.events],
        eventsExpiresAt: page.eventsExpiresAt,
        historyComplete: page.historyComplete,
        run: nextRun,
        runs: this.#state.value.runs.map((candidate) => (candidate.runId == nextRun.runId ? nextRun : candidate)),
      })
      await this.#loadResult(nextRun, current)
      if (isRunTerminal(nextRun.status) && page.done) return
      const starting = nextRun.status == 'queued' || nextRun.status == 'starting'
      const nextUnchangedStartingPolls = starting && nextRun.status == run.status ? unchangedStartingPolls + 1 : 0
      const delay =
        isRunTerminal(nextRun.status) || page.events.length == eventPageLimit
          ? 0
          : starting
            ? Math.min(runningPollDelay, startingPollDelay * 2 ** Math.max(0, nextUnchangedStartingPolls - 1))
            : runningPollDelay
      this.#timer = globalThis.setTimeout(() => void this.#poll(nextRun, current, nextUnchangedStartingPolls), delay)
    } catch (error) {
      if (current() && this.#state.value.run?.runId == run.runId) {
        this.#set({ observationFailed: true })
        this.#setNotice(errorNotice(error, this.#i18n.t))
      }
    }
  }

  async #loadResult(run: Run, current: Current): Promise<void> {
    if (!isRunTerminal(run.status) || this.#state.value.result?.runId == run.runId) return
    const result = await this.#client.getRunResult(run.projectId, run.runId)
    if (current() && this.#state.value.run?.runId == run.runId) this.#set({ result })
  }

  #clearTimer(): void {
    if (this.#timer != null) globalThis.clearTimeout(this.#timer)
    this.#timer = undefined
  }

  #set(patch: Partial<RunState>): void {
    this.#state.set({ ...this.#state.value, ...patch })
  }
}
