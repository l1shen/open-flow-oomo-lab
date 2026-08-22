import type { Run, RunEvent } from './api.ts'

import { describe, expect, it } from 'vitest'
import { serializeRunLog } from './runs/runLogExport.ts'

const run: Run = {
  createdAt: '2026-08-11T00:00:00.000Z',
  finishedAt: '2026-08-11T00:00:00.008Z',
  flowId: 'main',
  projectId: 'project-1',
  revisionId: 'revision-1',
  runId: 'run-1',
  source: 'draft',
  startedAt: '2026-08-11T00:00:00.000Z',
  status: 'completed',
  version: 1,
}

const events: readonly RunEvent[] = [
  {
    createdAt: run.createdAt,
    kind: 'node.output',
    payload: { handle: 'result', output: { kind: 'inline', value: 'hello' } },
    sequence: 1,
  },
]

describe('run log export', () => {
  it('serializes public run facts and observation completeness as JSONL', () => {
    const records = serializeRunLog(run, events, false, '2026-08-12T00:00:00.000Z')
      .trimEnd()
      .split('\n')
      .map((line) => JSON.parse(line))

    expect(records).toEqual([
      { record: 'run', value: run },
      { record: 'event', value: events[0] },
      {
        record: 'observation',
        value: { eventsExpiresAt: '2026-08-12T00:00:00.000Z', historyComplete: false },
      },
    ])
  })
})
