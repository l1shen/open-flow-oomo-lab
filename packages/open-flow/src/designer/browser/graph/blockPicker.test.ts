import type { BlockPickerItem } from './blockPicker.ts'

import { describe, expect, it } from 'vitest'
import { filterBlockPickerItems, mergeBlockPickerItems } from './blockPicker.ts'

const items: BlockPickerItem[] = [
  { label: 'Blocks', type: 'divider' },
  { description: 'Run source code.', label: 'JavaScript', type: 'block' },
  { label: 'Triggers', type: 'divider' },
  { description: 'Receive an HTTP request.', label: 'Webhook', type: 'trigger' },
]

describe('block picker items', () => {
  it('matches labels, descriptions, and complete groups without leaving empty dividers', () => {
    expect(filterBlockPickerItems('source', items).map((item) => item.label)).toEqual(['Blocks', 'JavaScript'])
    expect(filterBlockPickerItems('webhook', items).map((item) => item.label)).toEqual(['Triggers', 'Webhook'])
    expect(filterBlockPickerItems('triggers', items).map((item) => item.label)).toEqual(['Triggers', 'Webhook'])
    expect(filterBlockPickerItems('missing', items)).toEqual([])
  })

  it('preserves stable item indexes when filtering an indexed catalog again', () => {
    const indexed = filterBlockPickerItems('', items)
    expect(filterBlockPickerItems('webhook', indexed).map(({ index, label }) => ({ index, label }))).toEqual([
      { index: 2, label: 'Triggers' },
      { index: 3, label: 'Webhook' },
    ])
  })

  it('merges asynchronous results into their existing groups in provider order', () => {
    const local = filterBlockPickerItems('', items)
    const additions = filterBlockPickerItems('', [
      { label: 'Triggers', type: 'divider' },
      { label: 'GitHub issue', type: 'trigger' },
      { label: 'Connectors', type: 'divider' },
      { label: 'Send email', type: 'connector' },
    ]).map((item, index) => Object.assign({}, item, { index: items.length + index }))

    expect(mergeBlockPickerItems(local, additions).map((item) => item.label)).toEqual([
      'Blocks',
      'JavaScript',
      'Triggers',
      'Webhook',
      'GitHub issue',
      'Connectors',
      'Send email',
    ])
  })
})
