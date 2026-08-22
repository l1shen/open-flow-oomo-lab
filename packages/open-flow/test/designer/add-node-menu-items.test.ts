import { describe, expect, it } from 'vitest'
import { provideAddNodeMenuItems } from '../../src/designer/browser/actions/addNodeMenuItems.ts'
import { createI18n } from '../../src/designer/browser/i18n/index.ts'

describe('add node menu items', () => {
  it('uses product locale labels instead of exposing translation keys', () => {
    const items = provideAddNodeMenuItems(createI18n('en'), [])

    expect(items.find((item) => item.type == 'comment')?.label).toBe('Comment')
    expect(items.find((item) => item.type == 'divider')?.label).toBe('Tasks and subflows')
    expect(items.filter((item) => item.type == 'scriptlet').map((item) => item.label)).toEqual(['TypeScript', 'JavaScript'])
    expect(items.filter((item) => item.type == 'llm').map((item) => item.label)).toEqual(['LLM Chat', 'LLM Structured Output'])
  })
})
