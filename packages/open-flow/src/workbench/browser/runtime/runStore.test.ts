import type { DraftRun, RunCancellation, RunResult } from './api.ts'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api.ts'
import { RunStore } from './runs/runStore.ts'

const run: DraftRun = {
  closureDigest: 'closure',
  createdAt: '2026-08-11T00:00:00.000Z',
  engineContract: 'open-flow-engine/v1',
  engineDigest: 'engine-digest',
  flowId: 'main',
  modelVersion: 1,
  projectId: 'project-1',
  revisionDigest: 'revision-digest',
  revisionId: 'revision-1',
  runId: 'run-1',
  source: 'draft',
  status: 'queued',
  version: 1,
}

const activeRun: DraftRun = { ...run, startedAt: '2026-08-11T00:00:01.000Z', status: 'running' }
const cancelCases = [
  {
    cancellation: { cancelAccepted: true, runId: run.runId, status: 'canceled', version: 1 } satisfies RunCancellation,
    event: 'run.canceled' as const,
    name: 'uses the committed canceled terminal after an accepted cancellation',
    result: {
      finishedAt: '2026-08-11T00:00:02.000Z',
      runId: run.runId,
      status: 'canceled',
      version: 1,
    } satisfies RunResult,
    terminal: {
      ...activeRun,
      finishedAt: '2026-08-11T00:00:02.000Z',
      status: 'canceled',
    } satisfies DraftRun,
  },
  {
    cancellation: { cancelAccepted: false, runId: run.runId, status: 'completed', version: 1 } satisfies RunCancellation,
    event: 'run.completed' as const,
    name: 'uses the real completed terminal when execution wins the cancellation race',
    result: {
      finishedAt: '2026-08-11T00:00:02.000Z',
      result: { message: 'done' },
      runId: run.runId,
      status: 'completed',
      version: 1,
    } satisfies RunResult,
    terminal: {
      ...activeRun,
      finishedAt: '2026-08-11T00:00:02.000Z',
      status: 'completed',
    } satisfies DraftRun,
  },
]

beforeEach(() => {
  vi.stubGlobal('cancelIdleCallback', vi.fn())
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn(() => 1),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RunStore', () => {
  it('polls startup more frequently than active execution', async () => {
    vi.useFakeTimers()
    const running: DraftRun = { ...run, startedAt: '2026-08-11T00:00:01.000Z', status: 'running' }
    const finished: DraftRun = { ...running, finishedAt: '2026-08-11T00:00:02.000Z', status: 'completed' }
    const getRun = vi.fn().mockResolvedValueOnce(run).mockResolvedValueOnce(running).mockResolvedValueOnce(finished)
    const store = new RunStore(
      {
        cancelRun: vi.fn(),
        getRun,
        getRunEvents: vi.fn(async (candidateRunId: string) => ({
          done: true,
          events: [],
          historyComplete: true,
          nextAfter: 0,
          runId: candidateRunId,
          version: 1 as const,
        })),
        getRunResult: vi.fn(async () => ({
          finishedAt: finished.finishedAt!,
          result: null,
          runId: run.runId,
          status: 'completed' as const,
          version: 1 as const,
        })),
        listRuns: vi.fn(),
      },
      vi.fn(),
    )

    const current = store.prepareStart()
    store.follow(run, current)
    await vi.advanceTimersByTimeAsync(0)
    expect(getRun).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(499)
    expect(getRun).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(getRun).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1199)
    expect(getRun).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(getRun).toHaveBeenCalledTimes(3)

    store.dispose()
  })

  it('backs off polling while a Run remains queued', async () => {
    vi.useFakeTimers()
    const getRun = vi.fn(async () => run)
    const store = new RunStore(
      {
        cancelRun: vi.fn(),
        getRun,
        getRunEvents: vi.fn(async () => ({ done: true, events: [], historyComplete: true, nextAfter: 0, runId: run.runId, version: 1 as const })),
        getRunResult: vi.fn(),
        listRuns: vi.fn(),
      },
      vi.fn(),
    )

    const current = store.prepareStart()
    store.follow(run, current)
    await vi.advanceTimersByTimeAsync(0)
    expect(getRun).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(getRun).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(999)
    expect(getRun).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(getRun).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1199)
    expect(getRun).toHaveBeenCalledTimes(3)
    await vi.advanceTimersByTimeAsync(1)
    expect(getRun).toHaveBeenCalledTimes(4)
    store.dispose()
  })

  it('follows only a Run accepted by the current start session', async () => {
    const finished: DraftRun = { ...run, finishedAt: run.createdAt, status: 'completed' }
    const store = new RunStore(
      {
        cancelRun: vi.fn(),
        getRun: vi.fn(async () => finished),
        getRunEvents: vi.fn(async () => ({ done: true, events: [], historyComplete: true, nextAfter: 0, runId: run.runId, version: 1 as const })),
        getRunResult: vi.fn(async () => ({ finishedAt: run.createdAt, result: null, runId: run.runId, status: 'completed' as const, version: 1 as const })),
        listRuns: vi.fn(),
      },
      vi.fn(),
    )

    const current = store.prepareStart()
    expect(store.follow(run, current)).toBe(true)
    await vi.waitFor(() => expect(store.$.result.value?.runId).toBe(run.runId))

    const stale = store.prepareStart()
    store.reset()
    expect(store.follow(run, stale)).toBe(false)
    expect(store.$.run.value).toBeUndefined()
    store.dispose()
  })

  it.each(cancelCases)('$name', async ({ cancellation, event, result, terminal }) => {
    const pending = Promise.withResolvers<RunCancellation>()
    const cancelRun = vi.fn(() => pending.promise)
    const setNotice = vi.fn()
    const getRun = vi.fn().mockResolvedValueOnce(activeRun).mockResolvedValueOnce(terminal)
    const getRunEvents = vi
      .fn()
      .mockResolvedValueOnce({ done: false, events: [], historyComplete: true, nextAfter: 0, runId: run.runId, version: 1 as const })
      .mockResolvedValueOnce({
        done: true,
        events: [{ createdAt: terminal.finishedAt!, kind: event, payload: {}, sequence: 1 }],
        historyComplete: true,
        nextAfter: 1,
        runId: run.runId,
        version: 1 as const,
      })
    const getRunResult = vi.fn(async () => result)
    const store = new RunStore(
      {
        cancelRun,
        getRun,
        getRunEvents,
        getRunResult,
        listRuns: vi.fn(async () => ({ projectId: run.projectId, runs: [activeRun], version: 1 as const })),
      },
      setNotice,
    )

    await store.load(run.projectId, run.flowId)
    await vi.waitFor(() => expect(store.$.run.value?.status).toBe('running'))

    const canceling = store.cancel()
    expect(store.$.cancelingRunId.value).toBe(run.runId)
    await store.cancel()
    expect(cancelRun).toHaveBeenCalledOnce()
    pending.resolve(cancellation)
    await canceling

    expect(cancelRun).toHaveBeenCalledOnce()
    expect(cancelRun).toHaveBeenCalledWith(run.runId)
    expect(store.$.cancelingRunId.value).toBeUndefined()
    expect(store.$.run.value).toEqual(terminal)
    expect(store.$.runs.value[0]).toEqual(terminal)
    expect(store.$.events.value.at(-1)?.kind).toBe(event)
    expect(store.$.result.value).toEqual(result)
    expect(setNotice.mock.calls.every(([notice]) => notice == null)).toBe(true)

    await store.cancel()
    expect(cancelRun).toHaveBeenCalledOnce()
    store.dispose()
  })

  it('appends terminal event pages using the returned cursor', async () => {
    const finished: DraftRun = {
      ...activeRun,
      eventsExpiresAt: '2026-08-12T00:00:00.000Z',
      finishedAt: '2026-08-11T00:00:02.000Z',
      status: 'completed',
    }
    const getRunEvents = vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        events: [{ createdAt: finished.createdAt, kind: 'run.queued' as const, payload: {}, sequence: 1 }],
        eventsExpiresAt: finished.eventsExpiresAt,
        historyComplete: true,
        nextAfter: 1,
        runId: finished.runId,
        version: 1 as const,
      })
      .mockResolvedValueOnce({
        done: true,
        events: [{ createdAt: finished.finishedAt!, kind: 'run.completed' as const, payload: {}, sequence: 2 }],
        eventsExpiresAt: finished.eventsExpiresAt,
        historyComplete: true,
        nextAfter: 2,
        runId: finished.runId,
        version: 1 as const,
      })
    const store = new RunStore(
      {
        cancelRun: vi.fn(),
        getRun: vi.fn(async () => finished),
        getRunEvents,
        getRunResult: vi.fn(async () => ({
          finishedAt: finished.finishedAt!,
          result: { message: 'done' },
          runId: finished.runId,
          status: 'completed' as const,
          version: 1 as const,
        })),
        listRuns: vi.fn(async () => ({ projectId: finished.projectId, runs: [finished], version: 1 as const })),
      },
      vi.fn(),
    )

    await store.load(finished.projectId, finished.flowId)
    await vi.waitFor(() => expect(store.$.events.value).toHaveLength(2))

    expect(getRunEvents).toHaveBeenNthCalledWith(1, finished.runId, { after: 0, limit: 100 })
    expect(getRunEvents).toHaveBeenNthCalledWith(2, finished.runId, { after: 1, limit: 100 })
    expect(store.$.events.value.map((event) => event.sequence)).toEqual([1, 2])
    expect(store.$.eventsExpiresAt.value).toBe(finished.eventsExpiresAt)
    expect(store.$.historyComplete.value).toBe(true)
    expect(store.$.result.value?.status).toBe('completed')
    store.dispose()
  })

  it('keeps the terminal result available when detailed events have expired', async () => {
    const finished: DraftRun = { ...activeRun, finishedAt: '2026-08-11T00:00:02.000Z', status: 'completed' }
    const setNotice = vi.fn()
    const store = new RunStore(
      {
        cancelRun: vi.fn(),
        getRun: vi.fn(async () => finished),
        getRunEvents: vi.fn(async () => {
          throw new ApiError(410, 'run.events-expired', 'Run events expired.')
        }),
        getRunResult: vi.fn(async () => ({
          finishedAt: finished.finishedAt!,
          result: { message: 'done' },
          runId: finished.runId,
          status: 'completed' as const,
          version: 1 as const,
        })),
        listRuns: vi.fn(async () => ({ projectId: finished.projectId, runs: [finished], version: 1 as const })),
      },
      setNotice,
    )

    await store.load(finished.projectId, finished.flowId)
    await vi.waitFor(() => expect(store.$.result.value?.status).toBe('completed'))

    expect(store.$.historyComplete.value).toBe(false)
    expect(store.$.events.value).toEqual([])
    expect(setNotice.mock.calls.every(([notice]) => notice == null)).toBe(true)
    store.dispose()
  })

  it('loads run history, follows the selected run, and appends the next page', async () => {
    const first: DraftRun = { ...run, finishedAt: '2026-08-11T00:00:02.000Z', startedAt: '2026-08-11T00:00:01.000Z', status: 'completed' }
    const second: DraftRun = {
      ...first,
      createdAt: '2026-08-10T00:00:00.000Z',
      finishedAt: '2026-08-10T00:00:02.000Z',
      runId: 'run-2',
      startedAt: '2026-08-10T00:00:01.000Z',
    }
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce({ nextCursor: 'next', projectId: 'project-1', runs: [first], version: 1 })
      .mockResolvedValueOnce({ projectId: 'project-1', runs: [second], version: 1 })
    const getRun = vi.fn(async (runId: string) => (runId == first.runId ? first : second))
    const store = new RunStore(
      {
        cancelRun: vi.fn(),
        getRun,
        getRunEvents: vi.fn(async (runId: string) => ({
          done: true,
          events: [{ createdAt: first.createdAt, kind: 'run.completed' as const, payload: {}, sequence: 1 }],
          historyComplete: true,
          nextAfter: 1,
          runId,
          version: 1 as const,
        })),
        getRunResult: vi.fn(async (runId: string) => ({
          finishedAt: runId == first.runId ? first.finishedAt! : second.finishedAt!,
          result: { runId },
          runId,
          status: 'completed' as const,
          version: 1 as const,
        })),
        listRuns,
      },
      vi.fn(),
    )

    store.setEventFilter('log')
    await store.load('project-1', 'main')
    await vi.waitFor(() => expect(store.$.result.value?.runId).toBe('run-1'))
    expect(store.$.eventFilter.value).toBe('log')
    expect(listRuns).toHaveBeenNthCalledWith(1, 'project-1', { flowId: 'main', limit: 50 })

    await store.loadMore()
    expect(store.$.runs.value.map((candidate) => candidate.runId)).toEqual(['run-1', 'run-2'])
    expect(listRuns).toHaveBeenNthCalledWith(2, 'project-1', { cursor: 'next', flowId: 'main', limit: 50 })

    store.select('run-2')
    await vi.waitFor(() => expect(store.$.result.value?.runId).toBe('run-2'))
    expect(getRun).toHaveBeenLastCalledWith('run-2')
    store.dispose()
  })

  it('exposes run history load failure and retries the same target', async () => {
    const listRuns = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'request.failed', 'History failed.'))
      .mockResolvedValueOnce({ projectId: run.projectId, runs: [], version: 1 as const })
    const store = new RunStore(
      {
        cancelRun: vi.fn(),
        getRun: vi.fn(),
        getRunEvents: vi.fn(),
        getRunResult: vi.fn(),
        listRuns,
      },
      vi.fn(),
    )

    await store.load(run.projectId, run.flowId)
    expect(store.$.loadFailed.value).toBe(true)

    await store.retryLoad()
    expect(store.$.loadFailed.value).toBe(false)
    expect(listRuns).toHaveBeenLastCalledWith(run.projectId, { flowId: run.flowId, limit: 50 })
    store.dispose()
  })

  it('keeps an observation failure recoverable without reloading run history', async () => {
    const finished: DraftRun = { ...activeRun, finishedAt: '2026-08-11T00:00:02.000Z', status: 'completed' }
    const getRun = vi
      .fn()
      .mockRejectedValueOnce(new ApiError(503, 'request.failed', 'Observation failed.'))
      .mockResolvedValueOnce(finished)
    const store = new RunStore(
      {
        cancelRun: vi.fn(),
        getRun,
        getRunEvents: vi.fn(async () => ({ done: true, events: [], historyComplete: true, nextAfter: 0, runId: run.runId, version: 1 as const })),
        getRunResult: vi.fn(async () => ({
          finishedAt: finished.finishedAt!,
          result: null,
          runId: run.runId,
          status: 'completed' as const,
          version: 1 as const,
        })),
        listRuns: vi.fn(async () => ({ projectId: run.projectId, runs: [finished], version: 1 as const })),
      },
      vi.fn(),
    )

    await store.load(run.projectId, run.flowId)
    await vi.waitFor(() => expect(store.$.observationFailed.value).toBe(true))

    store.retryObservation()
    await vi.waitFor(() => expect(store.$.result.value?.status).toBe('completed'))
    expect(store.$.observationFailed.value).toBe(false)
    expect(getRun).toHaveBeenCalledTimes(2)
    store.dispose()
  })
})
