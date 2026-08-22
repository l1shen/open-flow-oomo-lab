import type { Diagnostic, Draft, TriggerNode } from '../api.ts'
import type { ConnectorStore } from '../stores/connectorStore.ts'
import type { TriggerStore } from '../stores/triggerStore.ts'
import type { WorkspaceStore } from '../stores/workspaceStore.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n.ts'
import { revisionView } from '../revisionView.ts'
import { NodeInspector } from './nodeInspector.tsx'

const definition = {
  configSchema: {
    properties: { repository: { description: 'Repository name.', title: 'Repository', type: 'string' } },
    required: ['repository'],
    type: 'object',
  },
  definitionVersion: 1,
  description: 'Run when an issue changes.',
  displayName: 'GitHub Issue Event',
  key: 'github.issue_event',
  name: 'issue_event',
  payloadSchema: { type: 'object' },
  provider: 'github',
} as const

function project(trigger: TriggerNode): Draft {
  return {
    actorId: 'actor',
    content: {
      document: {
        bindings: trigger.kind == 'poll' || trigger.kind == 'integration' ? { connection: { kind: 'connection', target: 'github-work' } } : {},
        flows: { main: { graph: { nodes: { trigger } }, name: 'Main' } },
        subflows: {},
        tasks: {},
      },
      modelVersion: 1,
      modules: {},
    },
    createdAt: '2026-08-12T00:00:00.000Z',
    digest: 'digest',
    modelVersion: 1,
    parentRevisionId: null,
    projectId: 'project',
    revisionId: 'revision',
    version: 1,
  }
}

function renderTrigger(trigger: TriggerNode, diagnostics: readonly Diagnostic[] = []): string {
  const revision = revisionView(project(trigger))
  return renderToStaticMarkup(
    <I18nProvider i18n={createI18n('en')}>
      <NodeInspector
        connectorAuthorizationPending={false}
        connectorLoading={false}
        connectors={{} as ConnectorStore}
        diagnostics={diagnostics}
        disabled={false}
        revision={revision}
        selection={revision.selection({ id: 'main', kind: 'flow' }, 'trigger')}
        store={{} as WorkspaceStore}
        target={{ id: 'main', kind: 'flow' }}
        triggerActiveConnections={[]}
        triggerAuthorizationPending={false}
        triggerConnectionLoading={false}
        triggers={{} as TriggerStore}
      />
    </I18nProvider>,
  )
}

describe('Trigger Inspector', () => {
  it('keeps Webhook input definitions and options in the node instead of duplicating them in the Inspector', () => {
    const markup = renderTrigger({
      inputsDef: [{ handle: 'event', jsonSchema: { type: 'object' }, nullable: false }],
      kind: 'webhook',
      name: 'Incoming webhook',
      options: { allowedMethods: ['POST'] },
    })

    expect(markup).not.toContain('Webhook input definitions (JSON)')
    expect(markup).not.toContain('&quot;handle&quot;: &quot;event&quot;')
    expect(markup).not.toContain('Webhook options (JSON)')
    expect(markup).not.toContain('&quot;POST&quot;')
  })

  it('keeps Cron and Poll schedules in the node instead of duplicating them in the Inspector', () => {
    const cron = renderTrigger({
      cronTimes: [{ expression: '0 * * * *', timezone: 'UTC', type: 'cron' }],
      kind: 'cron',
      name: 'Hourly',
    })
    const poll = renderTrigger({
      bindingId: 'connection',
      config: { repository: 'oomol/open-flow' },
      definition: { ...definition, type: 'poll' },
      kind: 'poll',
      name: 'Poll issues',
      pollTimes: [{ type: 'every', unit: 'minute', value: 5 }],
    })

    expect(cron).not.toContain('Schedule (JSON)')
    expect(cron).not.toContain('0 * * * *')
    expect(poll).not.toContain('Schedule (JSON)')
    expect(poll).not.toContain('Repository *')
  })

  it('keeps Integration config fields in the node instead of duplicating them in the Inspector', () => {
    const markup = renderTrigger({
      bindingId: 'connection',
      config: { repository: 'oomol/open-flow' },
      definition: {
        ...definition,
        endpoint: { body: { allowArray: false, allowEmpty: false, formats: ['json'] }, methods: ['POST'], successStatus: 202 },
        type: 'integration',
      },
      kind: 'integration',
      name: 'GitHub Issue Event',
    })

    expect(markup).not.toContain('Repository *')
    expect(markup).not.toContain('value="oomol/open-flow"')
    expect(markup).not.toContain('Repository name.')
  })

  it('presents missing required Trigger config as incomplete rather than an error', () => {
    const markup = renderTrigger(
      {
        bindingId: 'connection',
        config: {},
        definition: {
          ...definition,
          endpoint: { body: { allowArray: false, allowEmpty: false, formats: ['json'] }, methods: ['POST'], successStatus: 202 },
          type: 'integration',
        },
        kind: 'integration',
        name: 'GitHub Issue Event',
      },
      [
        {
          code: 'trigger.config-incomplete',
          column: 0,
          line: 1,
          message: 'Complete the required Trigger config fields: repository.',
          path: '/document/flows/main/graph/nodes/trigger/config',
        },
      ],
    )

    expect(markup).toContain('diagnostics-section incomplete')
    expect(markup).toContain('Configuration required')
    expect(markup).toContain('Complete the required Trigger config fields: repository.')
  })
})
