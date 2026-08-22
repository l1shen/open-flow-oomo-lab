import type { Run, RunEvent } from '../api.ts'

export function serializeRunLog(run: Run, events: readonly RunEvent[], historyComplete: boolean, eventsExpiresAt?: string): string {
  const records = [
    { record: 'run', value: run },
    ...events.map((event) => ({ record: 'event', value: event })),
    {
      record: 'observation',
      value: {
        ...(eventsExpiresAt == null ? {} : { eventsExpiresAt }),
        historyComplete,
      },
    },
  ]
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`
}

export function downloadRunLog(run: Run, events: readonly RunEvent[], historyComplete: boolean, eventsExpiresAt?: string): void {
  const source = serializeRunLog(run, events, historyComplete, eventsExpiresAt)
  const url = URL.createObjectURL(new Blob([source], { type: 'application/x-ndjson;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.download = `run-log-${run.runId.replace(/[^a-zA-Z0-9_-]/g, '_')}.jsonl`
  anchor.href = url
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
