import type { DiagnosticItem } from '../designer/diagnostics.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { describe, expect, it } from 'vitest'
import { createI18n } from '../i18n.ts'
import { DiagnosticsPanel } from './diagnosticsPanel.tsx'

describe('Diagnostics Panel', () => {
  it('shows the node ID for a located problem', () => {
    const item = {
      diagnostic: {
        code: 'graph.node-output-incompatible',
        column: 0,
        line: 1,
        message: 'An upstream output is not compatible with this input.',
        path: '/document/graph/nodes/target/inputs/value',
      },
      location: { nodeId: 'target', section: 'inputs' },
      scope: 'node',
    } satisfies DiagnosticItem
    const markup = renderToStaticMarkup(
      <I18nProvider i18n={createI18n('en')}>
        <DiagnosticsPanel checked checking={false} items={[item]} onClose={() => undefined} onRefresh={() => undefined} onSelect={() => undefined} />
      </I18nProvider>,
    )

    expect(markup).toContain('Node ID: target')
  })
})
