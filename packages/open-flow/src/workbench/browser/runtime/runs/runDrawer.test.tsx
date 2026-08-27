import type { Run, RunResult } from '../api.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n.ts'
import { RunDrawer } from './runDrawer.tsx'

function renderFailure(status: 'failed' | 'indeterminate'): string {
  const finishedAt = '2026-08-27T10:00:01.000Z'
  const run: Run = {
    createdAt: '2026-08-27T10:00:00.000Z',
    finishedAt,
    flowId: 'flow',
    revisionId: 'revision',
    runId: 'run',
    source: 'draft',
    status,
    version: 1,
  }
  const result: RunResult = {
    error: { code: 'binding.unresolved', message: 'Variable API_TOKEN could not be resolved.' },
    finishedAt,
    runId: run.runId,
    status,
    version: 1,
  }
  return renderToStaticMarkup(
    <I18nProvider i18n={createI18n('en')}>
      <RunDrawer
        cancelDisabled={false}
        canceling={false}
        eventFilter="all"
        eventNodes={new Map()}
        events={[]}
        eventsExpiresAt={undefined}
        historyComplete
        observationFailed={false}
        onCancel={() => undefined}
        onClose={() => undefined}
        onEventFilterChange={() => undefined}
        onLocateEvent={() => undefined}
        onRetryObservation={() => undefined}
        onToggle={() => undefined}
        open
        result={result}
        run={run}
        submitting={false}
        visible
      />
    </I18nProvider>,
  )
}

describe('RunDrawer terminal result', () => {
  it.each(['failed', 'indeterminate'] as const)('shows the final %s error', (status) => {
    const markup = renderFailure(status)

    expect(markup).toContain('run-log-result danger')
    expect(markup).toContain('binding.unresolved')
    expect(markup).toContain('Variable API_TOKEN could not be resolved.')
  })
})
