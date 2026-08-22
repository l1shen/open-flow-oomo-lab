import type { Flow, Live, PollTriggerTestResult, TriggerActivity, TriggerBinding } from '../api.ts'
import type { RevisionView } from '../revisionView.ts'
import type { WorkbenchStore } from '../stores/workbenchStore.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { val } from 'value-enhancer'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from '../i18n.ts'
import { PublicationsView } from './publicationsView.tsx'

const flow: Flow = {
  draft: { closureDigest: 'closure-1', name: 'Main', revisionDigest: 'digest-1', revisionId: 'revision-1' },
  flowId: 'main',
  hasUnpublishedChanges: false,
  live: null,
}

const live: Live = {
  flowId: 'main',
  hasUnpublishedChanges: false,
  projectId: 'project-1',
  publication: {
    actorId: 'actor-1',
    closureDigest: 'closure-1',
    createdAt: '2026-08-12T00:00:00.000Z',
    engineContract: 'open-flow-engine/v1',
    flowId: 'main',
    modelVersion: 1,
    operation: 'publish',
    projectId: 'project-1',
    publicationId: 'publication-1',
    revisionDigest: 'digest-1',
    revisionId: 'revision-1',
    version: 1,
  },
  revision: 1,
  status: 'runnable',
  version: 1,
}

function binding(kind: TriggerBinding['kind'], patch: Partial<TriggerBinding> = {}): TriggerBinding {
  return {
    currentPublicationId: 'publication-1',
    currentRevisionId: 'revision-1',
    flowId: 'main',
    health: 'healthy',
    kind,
    operatorState: 'active',
    projectId: 'project-1',
    runtimeVersion: 3,
    triggerNodeId: 'trigger-1',
    updatedAt: '2026-08-12T00:00:00.000Z',
    version: 1,
    ...patch,
  }
}

function renderTrigger(
  current: TriggerBinding,
  options: { readonly activities?: readonly TriggerActivity[]; readonly result?: PollTriggerTestResult } = {},
): string {
  const revision = {
    revision: { revisionId: 'revision-1' },
    trigger: () => ({ name: current.kind == 'webhook' ? 'Incoming webhook' : 'Watch files' }),
  } as unknown as RevisionView
  const store = {
    $: { busy: val(undefined) },
    publications: {
      $: {
        activities: val(options.activities ?? []),
        activitiesLoadFailed: val(false),
        activitiesLoading: val(false),
        activitiesLoadingMore: val(false),
        activitiesNextCursor: val(undefined),
        bindings: val([current]),
        changingTriggerId: val(undefined),
        detail: val({ binding: current, version: 1 as const }),
        detailLoading: val(false),
        live: val(live),
        loadFailed: val(false),
        loading: val(false),
        loadMoreFailed: val(false),
        loadingMore: val(false),
        nextCursor: val(undefined),
        publications: val([]),
        publishing: val(false),
        rollingBackPublicationId: val(undefined),
        selectedTriggerId: val(current.triggerNodeId),
        testingTriggerId: val(undefined),
        testResult: val(options.result),
        total: val(0),
      },
      closeTrigger: vi.fn(),
      load: vi.fn(),
      loadMore: vi.fn(),
      loadMoreTriggerActivities: vi.fn(),
      openTrigger: vi.fn(),
      publish: vi.fn(),
      rollback: vi.fn(),
      testTrigger: vi.fn(),
      toggleTrigger: vi.fn(),
    },
    workspace: {
      $: {
        diagnostics: val(undefined),
        projectId: val('project-1'),
        revision: val(revision),
        targetFlow: val(flow),
      },
    },
  } as unknown as WorkbenchStore
  return renderToStaticMarkup(
    <I18nProvider i18n={createI18n('en')}>
      <PublicationsView store={store} />
    </I18nProvider>,
  )
}

describe('PublicationsView Trigger details', () => {
  it('shows the current Webhook endpoint and its Draft name', () => {
    const markup = renderTrigger(binding('webhook', { endpointUrl: 'https://open-flow.example/v1/webhooks/endpoint-1' }))

    expect(markup).toContain('Incoming webhook')
    expect(markup).toContain('https://open-flow.example/v1/webhooks/endpoint-1')
    expect(markup).toContain('Copy URL')
    expect(markup).toContain('Successful Trigger executions appear in Runs.')
    expect(markup).not.toContain('Test poll')
  })

  it('shows Poll diagnostics, activity, and a non-mutating test result', () => {
    const current = binding('poll', { health: 'needs_reauth', lastErrorCode: 'connector.connection-required' })
    const markup = renderTrigger(current, {
      activities: [
        {
          activityId: 'activity-1',
          createdAt: '2026-08-12T00:00:00.000Z',
          errorCode: 'connector.connection-required',
          errorMessage: 'Reconnect the selected Google Drive account.',
          kind: 'delivery.failed',
        },
      ],
      result: { events: [{ id: 'event-1' }], filtered: 2, hasMore: true, version: 1 },
    })

    expect(markup).toContain('Watch files')
    expect(markup).toContain('Needs reauthorization')
    expect(markup).toContain('connector.connection-required')
    expect(markup).toContain('Reconnect the selected Google Drive account.')
    expect(markup).toContain('Delivery failed')
    expect(markup).toContain('Test poll')
    expect(markup).toContain('Events: 1')
    expect(markup).toContain('More events are available from the Provider.')
  })
})
