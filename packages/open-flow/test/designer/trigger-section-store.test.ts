import type { ObjectWidgetStore } from '../../src/designer/browser/stores/nodeHandle/objectWidget.store.ts'
import type { HandleName, TriggerDefinition, TriggerDescriptor } from '../../src/schema/index.ts'

import { val } from 'value-enhancer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TriggerSectionStore } from '../../src/designer/browser/stores/node/nodeSection/triggerSection.store.ts'

const configSchema = {
  additionalProperties: false,
  properties: {
    method: { enum: ['POST', 'PUT'], type: 'string' },
    path: { type: 'string' },
  },
  required: ['method', 'path'],
  type: 'object',
}

const triggerDefinition: TriggerDefinition = {
  config_schema: configSchema,
  name: 'Webhook',
  provisioning: { kind: 'webhook' },
  payload_schema: { additionalProperties: true, type: 'object' },
  service_id: 'open-flow',
  service_name: 'Open Flow',
}

function descriptor(config: TriggerDescriptor['config']): TriggerDescriptor {
  return {
    config,
    revision: '1',
    type: 'open-flow.webhook',
  }
}

describe('TriggerSectionStore', () => {
  beforeEach(() => {
    vi.stubGlobal('cancelIdleCallback', vi.fn())
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn(() => 1),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('edits only config while preserving the saved definition snapshot', () => {
    const initial = descriptor({ method: 'POST', path: '/events' })
    const definition = val<TriggerDefinition | undefined>(triggerDefinition)
    const trigger = val<TriggerDescriptor | undefined>(initial)
    const lang = val('en')
    const showSettings = val()
    const section = new TriggerSectionStore({
      createSchemaEditor: () => undefined,
      definition,
      lang,
      showSettings,
      trigger,
    })

    try {
      expect(section.config.$.valueHandleDefs.value).toEqual([
        {
          handle: 'config',
          json_schema: configSchema,
          value: initial.config,
        },
      ])
      expect(section.trigger$.value).toEqual({ ...initial, definition: triggerDefinition })
      expect(section.pollTime$.value).toBeUndefined()

      section.config.$$.valueHandleDefs?.set([
        {
          handle: 'config' as HandleName,
          json_schema: configSchema,
          value: { method: 'PUT', path: '/updated' },
        },
      ])

      expect(trigger.value).toEqual({
        ...initial,
        config: { method: 'PUT', path: '/updated' },
      })
      expect(definition.value).toBe(triggerDefinition)
    } finally {
      section.dispose()
      definition.dispose()
      lang.dispose()
      showSettings.dispose()
      trigger.dispose()
    }
  })

  it('persists one config field while the other schema fields remain unset', () => {
    const initial = descriptor({})
    const definition = val<TriggerDefinition | undefined>(triggerDefinition)
    const trigger = val<TriggerDescriptor | undefined>(initial)
    const lang = val('en')
    const showSettings = val()
    const section = new TriggerSectionStore({
      createSchemaEditor: () => undefined,
      definition,
      lang,
      showSettings,
      trigger,
    })

    try {
      const widget = section.configEditor$.value?.widget$.value as ObjectWidgetStore
      widget.fixedFields$.value.find((field) => field.name == 'method')?.value$?.set('POST')

      expect(trigger.value?.config).toEqual({ method: 'POST' })
    } finally {
      section.dispose()
      definition.dispose()
      lang.dispose()
      showSettings.dispose()
      trigger.dispose()
    }
  })

  it('rebinds the Trigger connection without changing its definition or config', () => {
    const initial = { ...descriptor({ method: 'POST', path: '/events' }), connection: 'github-work' }
    const definition = val<TriggerDefinition | undefined>({
      ...triggerDefinition,
      connector: { account_required: true, service_id: 'github' },
      service_id: 'github',
      service_name: 'GitHub',
    })
    const trigger = val<TriggerDescriptor | undefined>(initial)
    const lang = val('en')
    const showSettings = val()
    const section = new TriggerSectionStore({
      createSchemaEditor: () => undefined,
      definition,
      lang,
      showSettings,
      trigger,
    })

    try {
      section.setConnection('github-personal')

      expect(trigger.value).toEqual({ ...initial, connection: 'github-personal' })
      expect(section.trigger$.value?.definition).toBe(definition.value)
    } finally {
      section.dispose()
      definition.dispose()
      lang.dispose()
      showSettings.dispose()
      trigger.dispose()
    }
  })

  it('edits the single schedule of a poll Trigger independently from its provider config', () => {
    const initial: TriggerDescriptor = {
      config: { method: 'POST', path: '/events' },
      connection: 'github-work',
      poll_times: [{ type: 'every', unit: 'minute', value: 5 }],
      revision: '1',
      type: 'github.push',
    }
    const definition = val<TriggerDefinition | undefined>({
      ...triggerDefinition,
      connector: { account_required: true, service_id: 'github' },
      provisioning: { kind: 'poll' },
      service_id: 'github',
      service_name: 'GitHub',
    })
    const trigger = val<TriggerDescriptor | undefined>(initial)
    const lang = val('en')
    const showSettings = val()
    const section = new TriggerSectionStore({
      createSchemaEditor: () => undefined,
      definition,
      lang,
      showSettings,
      trigger,
    })

    try {
      expect(section.config.$.valueHandleDefs.value?.map(({ handle, value }) => ({ handle, value }))).toEqual([{ handle: 'config', value: initial.config }])
      expect(section.pollTime$.value).toEqual(initial.poll_times?.[0])

      section.setPollTime({ type: 'every', unit: 'hour', value: 10 })

      expect(trigger.value).toEqual({
        ...initial,
        poll_times: [{ type: 'every', unit: 'hour', value: 10 }],
      })

      section.setPollTime({ type: 'cron', expression: '0 * * * *', timezone: 'Asia/Shanghai' })

      expect(trigger.value).toEqual({
        ...initial,
        poll_times: [{ type: 'cron', expression: '0 * * * *', timezone: 'Asia/Shanghai' }],
      })
    } finally {
      section.dispose()
      definition.dispose()
      lang.dispose()
      showSettings.dispose()
      trigger.dispose()
    }
  })

  it('exposes a saved cron schedule without changing it', () => {
    const initial: TriggerDescriptor = {
      config: { method: 'POST', path: '/events' },
      connection: 'github-work',
      poll_times: [{ type: 'cron', expression: '30 * * * *', timezone: 'Asia/Shanghai' }],
      revision: '1',
      type: 'github.push',
    }
    const definition = val<TriggerDefinition | undefined>({
      ...triggerDefinition,
      connector: { account_required: true, service_id: 'github' },
      provisioning: { kind: 'poll' },
      service_id: 'github',
      service_name: 'GitHub',
    })
    const trigger = val<TriggerDescriptor | undefined>(initial)
    const lang = val('en')
    const showSettings = val()
    const section = new TriggerSectionStore({
      createSchemaEditor: () => undefined,
      definition,
      lang,
      showSettings,
      trigger,
    })

    try {
      expect(section.pollTime$.value).toEqual(initial.poll_times?.[0])
      expect(trigger.value).toEqual(initial)
    } finally {
      section.dispose()
      definition.dispose()
      lang.dispose()
      showSettings.dispose()
      trigger.dispose()
    }
  })

  it('publishes a stable config editor projection for non-structural schema edits', () => {
    const initial = descriptor({ method: 'POST', path: '/events' })
    const definition = val<TriggerDefinition | undefined>(triggerDefinition)
    const trigger = val<TriggerDescriptor | undefined>(initial)
    const lang = val('en')
    const showSettings = val()
    const section = new TriggerSectionStore({
      createSchemaEditor: () => undefined,
      definition,
      lang,
      showSettings,
      trigger,
    })

    try {
      const editor = section.configEditor$.value
      const onEditorChange = vi.fn()
      const stop = section.configEditor$.reaction(onEditorChange, true)

      definition.set({
        ...triggerDefinition,
        config_schema: {
          ...configSchema,
          properties: {
            ...configSchema.properties,
            method: { enum: ['POST', 'PUT', 'PATCH'], type: 'string' },
          },
        },
      })

      expect(section.configEditor$.value).toBe(editor)
      expect(onEditorChange).not.toHaveBeenCalled()

      definition.set({
        ...triggerDefinition,
        config_schema: { additionalProperties: false, properties: {}, type: 'object' },
      })

      expect(section.configEditor$.value).toBeUndefined()
      expect(onEditorChange).toHaveBeenCalledExactlyOnceWith(undefined)
      stop()
    } finally {
      section.dispose()
      definition.dispose()
      lang.dispose()
      showSettings.dispose()
      trigger.dispose()
    }
  })
})
