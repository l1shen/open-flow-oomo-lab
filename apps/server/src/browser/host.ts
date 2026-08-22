import type { ProjectChangeEvent, WorkbenchHost, WorkbenchNotification } from '@oomol-lab/open-flow/workbench'

const reconnectDelayMs = 1_000

export function createBrowserHost(notify: (notification: WorkbenchNotification | undefined) => void, sessionExpired: () => void): WorkbenchHost {
  return {
    get returnUrl() {
      return window.location.href
    },
    async openExternalPage(resolveUrl) {
      const tab = window.open('about:blank', '_blank')
      if (tab == null) return false
      tab.opener = null
      try {
        tab.location.href = await resolveUrl()
        return true
      } catch (error) {
        tab.close()
        throw error
      }
    },
    notify,
    request: async (input, init) => {
      const response = await fetch(input, { ...init, credentials: 'same-origin' })
      if (response.status == 401) sessionExpired()
      return response
    },
    subscribeProject(projectId, listener) {
      const cancellation = new AbortController()
      void followProject(projectId, listener, cancellation.signal, sessionExpired)
      return () => cancellation.abort()
    },
  }
}

async function followProject(
  projectId: string,
  listener: (event?: ProjectChangeEvent) => void,
  signal: AbortSignal,
  sessionExpired: () => void,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const response = await fetch(`/v1/projects/${encodeURIComponent(projectId)}/notifications`, {
        credentials: 'same-origin',
        headers: { accept: 'text/event-stream' },
        signal,
      })
      if (response.status == 401) {
        sessionExpired()
        return
      }
      if (!response.ok || response.body == null) throw new Error(`Project notification request returned ${response.status}.`)
      listener()
      await readProjectEvents(response.body, projectId, listener, signal)
    } catch {
      if (signal.aborted) return
    }
    await reconnectDelay(signal)
  }
}

async function readProjectEvents(
  body: ReadableStream<Uint8Array>,
  projectId: string,
  listener: (event: ProjectChangeEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffered = ''
  try {
    while (!signal.aborted) {
      const chunk = await reader.read()
      if (chunk.done) return
      buffered += decoder.decode(chunk.value, { stream: true })
      let boundary: number
      while ((boundary = buffered.indexOf('\n\n')) >= 0) {
        const frame = buffered.slice(0, boundary)
        buffered = buffered.slice(boundary + 2)
        const data = frame
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data.length > 0) dispatchProjectEvent(data, projectId, listener)
      }
    }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

function dispatchProjectEvent(data: string, projectId: string, listener: (event: ProjectChangeEvent) => void): void {
  const value = JSON.parse(data) as Partial<ProjectChangeEvent>
  if (value.version != 1 || value.projectId != projectId) return
  if (value.kind == 'draft.changed' && typeof value.revisionId == 'string') listener(value as ProjectChangeEvent)
  else if (value.kind == 'run.created' && typeof value.flowId == 'string' && typeof value.runId == 'string') listener(value as ProjectChangeEvent)
}

async function reconnectDelay(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, reconnectDelayMs)
    signal.addEventListener('abort', done, { once: true })
  })
}
