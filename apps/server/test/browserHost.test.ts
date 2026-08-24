import type { ProjectChangeEvent } from '@oomol-lab/open-flow/workbench'

import { afterEach, expect, it, vi } from 'vitest'
import { createBrowserHost } from '../browser/host.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

it('reads project invalidations from the same-origin SSE stream and stops cleanly', async () => {
  const event = { kind: 'run.created', flowId: 'main', projectId: 'project/1', runId: 'run-1', version: 1 } as const
  const fetcher = vi.fn(async () => new Response(`: connected\n\ndata: ${JSON.stringify(event)}\n\n`, { status: 200 }))
  vi.stubGlobal('fetch', fetcher)
  const opened = vi.fn()
  let stop: (() => void) | undefined
  const received = new Promise<ProjectChangeEvent>((resolve) => {
    stop = createBrowserHost(
      () => {},
      () => {},
    ).subscribeProject('project/1', (value) => {
      if (value == null) opened()
      else {
        stop?.()
        resolve(value)
      }
    })
  })

  await expect(received).resolves.toEqual(event)
  expect(opened).toHaveBeenCalledOnce()
  expect(fetcher).toHaveBeenCalledWith('/v1/projects/project%2F1/notifications', {
    credentials: 'same-origin',
    headers: { accept: 'text/event-stream' },
    signal: expect.any(AbortSignal),
  })
})

it('reconnects after an SSE stream ends and reads the next stream', async () => {
  vi.useFakeTimers()
  const event = { kind: 'draft.changed', projectId: 'project-1', revisionId: 'revision-2', version: 1 } as const
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response(': connected\n\n', { status: 200 }))
    .mockResolvedValueOnce(new Response(`: connected\n\ndata: ${JSON.stringify(event)}\n\n`, { status: 200 }))
  vi.stubGlobal('fetch', fetcher)
  const opened = vi.fn()
  let stop: (() => void) | undefined
  const received = new Promise<ProjectChangeEvent>((resolve) => {
    stop = createBrowserHost(
      () => {},
      () => {},
    ).subscribeProject('project-1', (value) => {
      if (value == null) opened()
      else {
        stop?.()
        resolve(value)
      }
    })
  })

  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(opened).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(999)
    expect(fetcher).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(1)
    await expect(received).resolves.toEqual(event)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(opened).toHaveBeenCalledTimes(2)
  } finally {
    stop?.()
    vi.useRealTimers()
  }
})

it('retries a failed SSE request and reads the recovered stream', async () => {
  vi.useFakeTimers()
  const event = { kind: 'draft.changed', projectId: 'project-1', revisionId: 'revision-2', version: 1 } as const
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new Error('Connection failed.'))
    .mockResolvedValueOnce(new Response(`: connected\n\ndata: ${JSON.stringify(event)}\n\n`, { status: 200 }))
  vi.stubGlobal('fetch', fetcher)
  let stop: (() => void) | undefined
  const received = new Promise<ProjectChangeEvent>((resolve) => {
    stop = createBrowserHost(
      () => {},
      () => {},
    ).subscribeProject('project-1', (value) => {
      if (value != null) {
        stop?.()
        resolve(value)
      }
    })
  })

  try {
    await vi.advanceTimersByTimeAsync(999)
    expect(fetcher).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)

    await expect(received).resolves.toEqual(event)
    expect(fetcher).toHaveBeenCalledTimes(2)
  } finally {
    stop?.()
    vi.useRealTimers()
  }
})

it('cancels an SSE reconnect while waiting after the stream ends', async () => {
  vi.useFakeTimers()
  const fetcher = vi.fn(async () => new Response(': connected\n\n', { status: 200 }))
  vi.stubGlobal('fetch', fetcher)
  const opened = vi.fn()
  const stop = createBrowserHost(
    () => {},
    () => {},
  ).subscribeProject('project-1', (value) => {
    if (value == null) opened()
  })

  try {
    await vi.advanceTimersByTimeAsync(0)
    expect(opened).toHaveBeenCalledOnce()
    stop()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(fetcher).toHaveBeenCalledOnce()
  } finally {
    stop()
    vi.useRealTimers()
  }
})

it('reports an expired session instead of retrying an unauthorized SSE request', async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 401 }))
  vi.stubGlobal('fetch', fetcher)
  let expired!: () => void
  const sessionExpired = new Promise<void>((resolve) => {
    expired = resolve
  })

  createBrowserHost(() => {}, expired).subscribeProject('project-1', () => {})
  await sessionExpired
  expect(fetcher).toHaveBeenCalledOnce()
})
