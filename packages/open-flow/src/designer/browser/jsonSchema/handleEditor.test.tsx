import type { TriggerDefinition, TriggerDescriptor } from '../../../schema/index.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { val } from 'value-enhancer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createI18n } from '../i18n/index.ts'
import { TriggerSectionStore } from '../stores/node/nodeSection/triggerSection.store.ts'
import { HandleEditor } from './handleEditor.tsx'

describe('HandleEditor form presentation', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows the required configuration fields instead of only setting hasError', () => {
    let validate: IdleRequestCallback | undefined
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        validate = callback
        return 1
      }),
    )
    vi.stubGlobal('cancelIdleCallback', vi.fn())

    const definition = val<TriggerDefinition | undefined>({
      config_schema: {
        additionalProperties: false,
        properties: {
          events: { items: { type: 'string' }, type: 'array' },
          owner: { type: 'string' },
          repo: { type: 'string' },
        },
        required: ['owner', 'repo', 'events'],
        type: 'object',
      },
      name: 'Repository event',
      payload_schema: { additionalProperties: true, type: 'object' },
      provisioning: { kind: 'integration' },
      service_id: 'github',
      service_name: 'GitHub',
    })
    const trigger = val<TriggerDescriptor | undefined>({ config: {}, revision: '1', type: 'github.on_repo_event' })
    const lang = val('en')
    const showSettings = val()
    const panelWidth = val<number | undefined>()
    const section = new TriggerSectionStore({
      createSchemaEditor: () => undefined,
      definition,
      lang,
      showSettings,
      trigger,
    })

    try {
      validate?.({ didTimeout: false, timeRemaining: () => 50 })
      const editor = section.configEditor$.value
      if (editor == null) throw new Error('Expected a Trigger configuration editor.')

      const hiddenMarkup = renderToStaticMarkup(
        <I18nProvider i18n={createI18n('en')}>
          <HandleEditor store={editor} panelWidth$={panelWidth} presentation="form" showFormError={false} showSchemaSettings={false} />
        </I18nProvider>,
      )
      const visibleMarkup = renderToStaticMarkup(
        <I18nProvider i18n={createI18n('en')}>
          <HandleEditor store={editor} panelWidth$={panelWidth} presentation="form" showSchemaSettings={false} />
        </I18nProvider>,
      )

      expect(hiddenMarkup).not.toContain('data-variant="destructive"')
      expect(visibleMarkup).toContain('data-variant="destructive"')
      expect(visibleMarkup).toContain('role="alert"')
      expect(visibleMarkup).toContain('Set the required fields: owner, repo, events.')
    } finally {
      section.dispose()
      definition.dispose()
      trigger.dispose()
      lang.dispose()
      showSettings.dispose()
      panelWidth.dispose()
    }
  })
})
