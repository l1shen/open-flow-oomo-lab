import type { HandleName, ValueHandleDef } from '../../../../../schema/index.ts'

import { val } from 'value-enhancer'
import { describe, expect, it } from 'vitest'
import { ValueSectionStore } from './valueSection.store.ts'

describe('ValueSectionStore', () => {
  it('tracks output connections on its handle rows', () => {
    const handle = 'name' as HandleName
    const connectedHandles = val<HandleName[] | undefined>()
    const store = new ValueSectionStore({
      lang: val('en'),
      role: 'author',
      handleOutputsTo: connectedHandles,
      valueHandleDefs: val<ValueHandleDef[]>([{ handle, json_schema: { type: 'string' } }]),
      showSettings: val(),
      createSchemaEditor: () => {},
    })

    const row = store.$.handles.value[0]
    expect(row.context.handlePosition).toBe('out')
    expect(row.reference$.value).toBe(false)

    connectedHandles.set([handle])
    expect(row.reference$.value).toBe(true)

    connectedHandles.set([])
    expect(row.reference$.value).toBe(false)
    store.dispose()
  })
})
