import styles from './InputHandleSection.module.scss'
import type { useStoreApi } from '@xyflow/react'
import type { Val } from 'value-enhancer'
import type { HandleName } from '../../../../schema/index.ts'
import type { HandleRowStore } from '../../stores/nodeHandle/handleRow.store.ts'
import type { DragNDropContext } from './dragNDrop.ts'

import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { setValue } from 'value-enhancer'
import { stopEvent, stopPropagation } from '../../base/dom.ts'
import { toRFHandleName } from '../../base/rfHelpers.ts'
import { Button } from '../../components/button.tsx'
import { Handle } from '../../components/handle.tsx'
import { iconOf } from '../../jsonSchema/preset.ts'
import { SchemaEditor } from '../../jsonSchema/schemaEditor.tsx'
import { ProductInputWidgetRenderer } from '../../llm/llmHandleEditor.tsx'
import { llmInputWidgetTitle } from '../../llm/widget.ts'
import { Card } from './card.tsx'

export interface InputHandleSectionProps {
  readonly dnd: DragNDropContext
  readonly handle: HandleRowStore
  readonly handleNames: readonly HandleName[]
  readonly panelWidth$: Val<number | undefined>
  readonly reactFlowStore: ReturnType<typeof useStoreApi>
  readonly showSchemaSettings?: boolean
  readonly validate: (name: string, oldName: string) => string | undefined
  readonly onDelete: () => void
  readonly onRename: (name: HandleName) => void
}

export function InputHandleSection(props: InputHandleSectionProps): React.ReactElement {
  const t = useTranslate()
  const { dnd, handle } = props
  const widget = useVal(handle.widget$)
  const schema = useVal(handle.schema$)
  const connected = useVal(handle.reference$)
  const description = useVal(handle.displayDescription$)
  const showSettings = useVal(handle.showSettings$)
  const error = useVal(handle.error$)
  const kind = useVal(handle.kind$)
  const title = llmInputWidgetTitle(schema) ?? handle.name
  const dragTarget = dnd.dragTarget?.handle == handle.name

  return (
    <Card
      icon="i-codicon:chevron-down"
      collapsedIcon="i-codicon:chevron-right"
      title={`${title} (${handle.name})`}
      titleSuffix={connected && <span className={styles.reference}>{`<${t('inputHandleEditor.reference')}>`}</span>}
      className={error && styles.error}
      contentClassName={styles.content}
      help={description}
      collapsed$={widget.collapsed$}
      forceCollapsed={connected ? true : undefined}
      onDrop={dnd.onDrop}
      onDragEnd={dnd.onDragEnd}
      onDragOver={(event) => dnd.onDragOver(event, handle)}
      dragPosition={dragTarget ? dnd.dragPosition : 0}
      prefix={
        <>
          <Handle id={toRFHandleName(handle.name)} type="input" kind={kind} />
          {handle.context.canEditSchema && (
            <div draggable className={`${styles.dragHandle} nodrag`} onDragStart={(event) => dnd.onDragStart(event, handle)} data-handle={`h:${handle.name}`}>
              <i className="i-carbon:draggable" />
            </div>
          )}
        </>
      }
      suffix={
        props.showSchemaSettings !== false && (
          <div className={styles.showSettings}>
            <Button
              active={showSettings}
              disabled={!handle.context.canViewSchema}
              title={t('inputHandleEditor.configPanelTitle')}
              onClick={(event) => {
                stopPropagation(event)
                setValue(handle.showSettings$, !showSettings)
              }}
            >
              <i className={iconOf('settings')} />
            </Button>
            {showSettings && (
              <div className={styles.schemaEditor} onClickCapture={stopEvent}>
                <SchemaEditor
                  title={t('inputHandleEditor.configPanelTitle')}
                  store={handle.schemaRowStore}
                  panelWidth$={props.panelWidth$}
                  reactFlowStore={props.reactFlowStore}
                  onClose={() => setValue(handle.showSettings$, false)}
                  validate={props.validate}
                  onRename={(name) => props.onRename(name as HandleName)}
                  onDelete={props.onDelete}
                />
              </div>
            )}
          </div>
        )
      }
    >
      <ProductInputWidgetRenderer store={handle} handleNames={props.handleNames} />
    </Card>
  )
}
