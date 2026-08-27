import styles from './InputHandleSection.module.scss'
import type { useStoreApi } from '@xyflow/react'
import type { Val } from 'value-enhancer'
import type { HandleName } from '../../../../schema/index.ts'
import type { InputSectionStore } from '../../stores/node/nodeSection/inputSection.store.ts'
import type { HandleRowStore } from '../../stores/nodeHandle/handleRow.store.ts'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { setValue } from 'value-enhancer'
import { Button } from '../../../../ui/browser/button.tsx'
import { stopEvent, stopPropagation } from '../../base/dom.ts'
import { toRFHandleName } from '../../base/rfHelpers.ts'
import { Handle } from '../../components/handle.tsx'
import { iconOf } from '../../jsonSchema/preset.ts'
import { SchemaEditor } from '../../jsonSchema/schemaEditor.tsx'
import { ProductInputWidgetRenderer } from '../../llm/llmHandleEditor.tsx'
import { llmInputWidgetTitle } from '../../llm/widget.ts'
import { useInputHandleDnd } from '../Nodes/inputHandleDnd.ts'
import { Card } from './card.tsx'
import { setHandleDragImage } from './dragNDrop.ts'

export interface InputHandleSectionProps {
  readonly section: InputSectionStore
  readonly handle: HandleRowStore
  readonly handles: readonly HandleRowStore[]
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
  const { handle, handles, section } = props
  const [dragHandle, setDragHandle] = useInputHandleDnd()
  const [dragPosition, setDragPosition] = useState(0)
  const removeDragImage = useRef<() => void>(() => undefined)
  const widget = useVal(handle.widget$)
  const schema = useVal(handle.schema$)
  const connected = useVal(handle.reference$)
  const description = useVal(handle.displayDescription$)
  const showSettings = useVal(handle.showSettings$)
  const error = useVal(handle.error$)
  const kind = useVal(handle.kind$)
  const title = llmInputWidgetTitle(schema) ?? handle.name

  useEffect(() => () => removeDragImage.current(), [])

  const onDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      section.onDragStart(handle.name)
      removeDragImage.current()
      removeDragImage.current = setHandleDragImage(event, title)
      setDragHandle(handle.name)
    },
    [handle, section, setDragHandle, title],
  )

  const onDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault()
      if (!dragHandle) return

      const peers = handles.filter((candidate) => candidate.context.additional == handle.context.additional)
      const from = peers.findIndex((candidate) => candidate.name == dragHandle)
      const to = peers.indexOf(handle)
      setDragPosition(from < 0 || from == to ? 0 : to - from)
    },
    [dragHandle, handle, handles],
  )

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault()
      if (dragHandle && dragPosition) {
        const peers = handles.filter((candidate) => candidate.context.additional == handle.context.additional)
        const index = peers.indexOf(handle)
        if (index >= 0) {
          section.moveHandle({ handle: dragHandle }, index)
        }
      }
      setDragPosition(0)
      setDragHandle(undefined)
      removeDragImage.current()
      removeDragImage.current = () => undefined
    },
    [dragHandle, dragPosition, handle, handles, section, setDragHandle],
  )

  const onDragEnd = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault()
      setDragPosition(0)
      setDragHandle(undefined)
      removeDragImage.current()
      removeDragImage.current = () => undefined
    },
    [setDragHandle],
  )

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
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={() => setDragPosition(0)}
      dragPosition={dragPosition}
      prefix={
        <>
          <Handle id={toRFHandleName(handle.name)} type="input" kind={kind} />
          {handle.context.canEditSchema && (
            <div draggable className={`${styles.dragHandle} nodrag`} onDragStart={onDragStart} data-handle={`h:${handle.name}`}>
              <i className="i-carbon:draggable" />
            </div>
          )}
        </>
      }
      suffix={
        props.showSchemaSettings !== false && (
          <div className={styles.showSettings}>
            <Button
              aria-label={t('inputHandleEditor.configPanelTitle')}
              disabled={!handle.context.canViewSchema}
              onClick={(event) => {
                stopPropagation(event)
                setValue(handle.showSettings$, !showSettings)
              }}
              size="icon-xs"
              title={t('inputHandleEditor.configPanelTitle')}
              variant={showSettings ? 'default' : 'ghost'}
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
