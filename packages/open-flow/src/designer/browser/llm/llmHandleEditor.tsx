import type { HandleRowStore } from '../stores/nodeHandle/handleRow.store.ts'

import { useVal } from 'use-value-enhancer'
import { MessagesWidget } from './messagesWidget.tsx'
import { ModelWidget } from './modelWidget.tsx'
import { llmInputWidget } from './widget.ts'

export interface ProductInputWidgetRendererProps {
  readonly handleNames: readonly string[]
  readonly store: HandleRowStore
}

export function ProductInputWidgetRenderer(props: ProductInputWidgetRendererProps): React.ReactElement | null {
  const schema = useVal(props.store.schema$)
  const widget = llmInputWidget(schema)
  if (widget == 'llm/messages') return <MessagesWidget {...props} />
  if (widget == 'llm/model') return <ModelWidget {...props} />
  return null
}
