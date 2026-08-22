import type { ProjectChangeEvent } from '@oomol-lab/open-flow/workbench'

import { afterEach, expect, it, vi } from 'vitest'
import { createBrowserHost } from '../src/browser/host.ts'

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
