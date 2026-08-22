import type { Run, RunEvent, RunResult } from './api.ts'
import type { RunEventFilter } from './runs/runStore.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { describe, expect, it } from 'vitest'
import { createI18n } from './i18n.ts'
import { RunDrawer } from './runs/runDrawer.tsx'
import { RunResultView } from './runs/runOutput.tsx'

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

const eventKinds = ['run.queued', 'run.started', 'node.started', 'node.output', 'node.completed', 'run.progress', 'run.completed'] as const
const events: readonly RunEvent[] = eventKinds.map((kind, index) => ({
  createdAt: '2026-08-11T00:00:00.000Z',
  kind,
  payload: {},
  sequence: index + 1,
}))

function renderDrawer(
  runEvents: readonly RunEvent[],
  historyComplete = true,
  eventsExpiresAt?: string,
  eventFilter: RunEventFilter = 'all',
  eventNodes: ReadonlyMap<number, string> = new Map(),
  observationFailed = false,
  selectedRun: Run | undefined = run,
  submitting = false,
): string {
  return renderToStaticMarkup(
    <I18nProvider i18n={createI18n('en')}>
      <RunDrawer
        cancelDisabled={false}
        canceling={false}
        eventFilter={eventFilter}
        eventNodes={eventNodes}
        events={runEvents}
        eventsExpiresAt={eventsExpiresAt}
        historyComplete={historyComplete}
        onCancel={() => undefined}
        onClose={() => undefined}
        onEventFilterChange={() => undefined}
        onLocateEvent={() => undefined}
        onRetryObservation={() => undefined}
        onToggle={() => undefined}
        observationFailed={observationFailed}
        open
        result={undefined}
        run={selectedRun}
        submitting={submitting}
        visible
      />
    </I18nProvider>,
  )
}

describe('RunDrawer', () => {
  it('shows submission feedback before the API returns a Run', () => {
    const markup = renderDrawer([], true, undefined, 'all', new Map(), false, undefined, true)
    expect(markup).toContain('Submitting')
    expect(markup).toContain('Submitting this fixed revision and creating its run record…')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).not.toContain('No run yet')
  })

  it('fits the timeline to its events before using an internal scrollbar', () => {
    expect(renderDrawer(events.slice(0, 3))).toContain('style="height:360px"')
    expect(renderDrawer(events.slice(0, 4))).toContain('style="height:360px"')
    expect(renderDrawer(events)).toContain('style="height:422px"')
  })

  it('uses the shared overlay scrollbar for the live timeline', () => {
    const markup = renderDrawer(events)
    expect(markup).toContain('run-content-scroll')
    expect(markup).toContain('event-table')
    expect(markup).toContain('data-overlayscrollbars-initialize')
  })

  it('describes immutable events instead of presenting them as current run states', () => {
    const markup = renderDrawer(events.slice(0, 3))
    expect(markup).toContain('Details')
    expect(markup).toContain('Enqueued')
    expect(markup).toContain('Started')
    expect(markup).not.toContain('Running')
    expect(markup).not.toContain('event-status')
  })

  it('connects tabs to their panels and exposes a recoverable observation failure', () => {
    const markup = renderDrawer(events.slice(0, 3), true, undefined, 'all', new Map(), true)
    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('aria-controls="run-drawer-timeline-panel"')
    expect(markup).toContain('id="run-drawer-timeline-panel"')
    expect(markup).toContain('role="tabpanel"')
    expect(markup).toContain('Run updates could not be loaded.')
    expect(markup).toContain('Retry')
  })

  it('explains expired and truncated event histories', () => {
    expect(renderDrawer([], false)).toContain('Detailed event history has expired. The terminal output remains available.')
    expect(
      renderDrawer(
        [...events, { createdAt: run.finishedAt!, kind: 'run.events-truncated', payload: {}, sequence: events.length + 1 }],
        true,
        '2026-08-12T00:00:00.000Z',
      ),
    ).toContain('Some events were omitted after this run reached its observation limit.')
  })

  it('filters timeline categories without hiding the active observation state', () => {
    const progress = renderDrawer(events, true, undefined, 'progress')
    expect(progress).toContain('run.progress')
    expect(progress).not.toContain('run.queued</code>')
    expect(progress).toContain('aria-pressed="true"')

    const truncated = renderDrawer(
      [...events, { createdAt: run.finishedAt!, kind: 'run.events-truncated', payload: {}, sequence: events.length + 1 }],
      true,
      undefined,
      'log',
    )
    expect(truncated).toContain('Some events were omitted after this run reached its observation limit.')
    expect(truncated).toContain('No events match this filter.')
  })

  it('offers canvas location only for indexed node events', () => {
    const nodeEvent: RunEvent = {
      createdAt: run.createdAt,
      kind: 'node.started',
      payload: { flowId: 'main', nodeId: 'task', nodeTitle: 'Code task', scopeId: 'root' },
      sequence: 8,
    }
    const markup = renderDrawer([nodeEvent], true, undefined, 'all', new Map([[nodeEvent.sequence, 'task']]))
    expect(markup).toContain('aria-label="Locate Code task on the canvas"')
    expect(markup).toContain('event-locate')
  })

  it('renders inline and stored node outputs from their public event payloads', () => {
    const inline: RunEvent = {
      createdAt: run.createdAt,
      kind: 'node.output',
      payload: { handle: 'result', output: { kind: 'inline', value: { count: 2, message: 'hello' } } },
      sequence: 8,
    }
    const stored: RunEvent = {
      createdAt: run.createdAt,
      kind: 'node.output',
      payload: { output: { digest: 'sha256:stored', encodedBytes: 2048, kind: 'stored', outputId: 'output-1' } },
      sequence: 9,
    }
    const markup = renderDrawer([inline, stored])
    expect(markup).toContain('Node output · result')
    expect(markup).toContain('message')
    expect(markup).toContain('hello')
    expect(markup).toContain('output-1')
    expect(markup).toContain('sha256:stored')
    expect(markup).toContain('A public output read API is required')
    expect(markup.match(/node\.output<\/code>/g)).toHaveLength(2)
  })

  it('groups adjacent outputs from one node execution into one result', () => {
    const output = (sequence: number, handle: string, value: RunEvent['payload'][string]): RunEvent => ({
      createdAt: run.createdAt,
      kind: 'node.output',
      payload: {
        executionId: 'execution-fetch-emails',
        handle,
        nodeId: 'fetch-emails',
        output: { kind: 'inline', value },
      },
      sequence,
    })
    const markup = renderDrawer([
      output(8, 'messages', [{ messageId: 'message-1' }]),
      output(9, 'nextPageToken', '00973996569101086170'),
      output(10, 'resultSizeEstimate', 201),
    ])

    expect(markup.match(/node\.output<\/code>/g)).toHaveLength(1)
    expect(markup).toContain('messages')
    expect(markup).toContain('nextPageToken')
    expect(markup).toContain('resultSizeEstimate')
    expect(markup).toContain('00973996569101086170')
    expect(markup).toContain('201')
    expect(markup).not.toContain('Node output · messages')
  })

  it('keeps adjacent outputs from different node executions separate', () => {
    const output = (sequence: number, executionId: string): RunEvent => ({
      createdAt: run.createdAt,
      kind: 'node.output',
      payload: { executionId, handle: 'result', nodeId: 'task', output: { kind: 'inline', value: sequence } },
      sequence,
    })
    const markup = renderDrawer([output(8, 'execution-a'), output(9, 'execution-b')])

    expect(markup.match(/node\.output<\/code>/g)).toHaveLength(2)
  })

  it('renders stable node failure codes with actionable copy', () => {
    const connectionFailure: RunEvent = {
      createdAt: run.createdAt,
      kind: 'node.failed',
      payload: { error: { code: 'connector.connection-required', message: 'internal message' } },
      sequence: 8,
    }
    const unavailable: RunEvent = {
      createdAt: run.createdAt,
      kind: 'node.failed',
      payload: { error: { code: 'connector.unavailable', message: 'internal message' } },
      sequence: 9,
    }
    const markup = renderDrawer([connectionFailure, unavailable])

    expect(markup).toContain('connector.connection-required')
    expect(markup).toContain('Reconnect it or choose another Connection')
    expect(markup).toContain('connector.unavailable')
    expect(markup).toContain('if it still fails, check the selected Connection')
    expect(markup).not.toContain('internal message')
  })

  it('renders the completed terminal result instead of the response envelope', () => {
    const result: RunResult = {
      finishedAt: run.finishedAt!,
      result: { answer: 42 },
      runId: run.runId,
      status: 'completed',
      version: 1,
    }
    const markup = renderToStaticMarkup(
      <I18nProvider i18n={createI18n('en')}>
        <RunResultView result={result} />
      </I18nProvider>,
    )
    expect(markup).toContain('Terminal result')
    expect(markup).toContain('answer')
    expect(markup).toContain('42')
    expect(markup).not.toContain('run-1')
  })
})
