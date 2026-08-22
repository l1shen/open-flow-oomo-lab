import type { TriggerRun } from '../api.ts'
import type { RevisionView } from '../revisionView.ts'
import type { WorkbenchStore } from '../stores/workbenchStore.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { val } from 'value-enhancer'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from '../i18n.ts'
import { RunsView } from './runsView.tsx'

const run: TriggerRun = {
  closureDigest: 'closure-1',
  createdAt: '2026-08-12T00:00:00.000Z',
  engineContract: 'open-flow-engine/v1',
  engineDigest: 'engine-1',
  flowId: 'main',
  modelVersion: 1,
  occurrenceId: 'occurrence-1',
  projectId: 'project-1',
  publicationId: 'publication-1',
  revisionDigest: 'digest-1',
  revisionId: 'revision-1',
  runId: 'run-trigger-1',
  source: 'trigger',
  status: 'running',
  triggerNodeId: 'trigger-1',
  version: 1,
}

describe('RunsView', () => {
  it('labels Trigger Runs and shows their admission identity', () => {
    const revision = {
      revision: { revisionId: 'revision-1' },
      trigger: () => ({ name: 'Watch files' }),
    } as unknown as RevisionView
    const store = {
      $: { runEventNodes: val(new Map()) },
      runs: {
        $: {
          cancelingRunId: val(undefined),
          eventFilter: val('all'),
          events: val([]),
          eventsExpiresAt: val(undefined),
          historyComplete: val(true),
          loadFailed: val(false),
          loading: val(false),
          loadMoreFailed: val(false),
          loadingMore: val(false),
          nextCursor: val(undefined),
          observationFailed: val(false),
          result: val(undefined),
          run: val(run),
          runs: val([run]),
        },
        cancel: vi.fn(),
        loadMore: vi.fn(),
        retryLoad: vi.fn(),
        retryObservation: vi.fn(),
        select: vi.fn(),
        setEventFilter: vi.fn(),
      },
      workspace: { $: { revision: val(revision) } },
    } as unknown as WorkbenchStore

    const markup = renderToStaticMarkup(
      <I18nProvider i18n={createI18n('en')}>
        <RunsView onLocateEvent={() => undefined} store={store} />
      </I18nProvider>,
    )

    expect(markup).toContain('Trigger')
    expect(markup).toContain('Trigger node: Watch files')
    expect(markup).toContain('Occurrence: occurrence-1')
    expect(markup).toContain('Publication: publication-1')
    expect(markup).not.toContain('· Live')
  })
})
