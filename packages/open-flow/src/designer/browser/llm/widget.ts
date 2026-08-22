import { isUnknownRecord } from '../../../base/common/type.ts'

export type LlmInputWidget = 'llm/messages' | 'llm/model'

export function llmInputWidget(schema: unknown): LlmInputWidget | undefined {
  if (!isUnknownRecord(schema)) return
  const widget = schema['ui:widget']
  if (widget == 'llm/messages') return 'llm/messages'
  if (widget == 'llm/model') return 'llm/model'
  return undefined
}

export function llmInputWidgetTitle(schema: unknown): string | undefined {
  if (!isUnknownRecord(schema)) return
  const options = schema['ui:options']
  if (!isUnknownRecord(options)) return
  return typeof options.title == 'string' && options.title.length > 0 ? options.title : undefined
}
