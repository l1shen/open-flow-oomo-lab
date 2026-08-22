import { describe, expect, it } from 'vitest'
import { llmInputWidget, llmInputWidgetTitle } from '../../src/designer/browser/llm/widget.ts'

describe('LLM handle editor', () => {
  it('selects only product-owned LLM widgets', () => {
    expect(llmInputWidget({ 'type': 'array', 'ui:widget': 'llm/messages' })).toBe('llm/messages')
    expect(llmInputWidget({ 'type': 'object', 'ui:widget': 'llm/model' })).toBe('llm/model')
    expect(llmInputWidget({ 'type': 'string', 'ui:widget': 'text' })).toBeUndefined()
    expect(llmInputWidget({ 'type': 'string', 'ui:options': { widget: 'llm/messages' } })).toBeUndefined()
  })

  it('reads section titles only from ui:options', () => {
    expect(llmInputWidgetTitle({ 'ui:options': { title: 'Prompt' } })).toBe('Prompt')
    expect(llmInputWidgetTitle({ title: 'JSON Schema title' })).toBeUndefined()
  })
})
