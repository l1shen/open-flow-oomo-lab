import type { FlowDesignerViewProps } from '../../../../designer/browser/graph/FlowDesigner/FlowDesignerView.tsx'
import type { AddNodeOption } from './addNodeOptions.ts'

import { renderToStaticMarkup } from 'react-dom/server'
import { I18nProvider } from 'val-i18n-react'
import { describe, expect, it, vi } from 'vitest'
import { createI18n } from '../i18n.ts'
import { WorkbenchDesigner } from './workbenchDesigner.tsx'

const captured = vi.hoisted(() => ({ props: undefined as FlowDesignerViewProps | undefined }))

vi.mock('../../../../designer/browser/graph/FlowDesigner/FlowDesignerView.tsx', () => ({
  FlowDesignerView: (props: FlowDesignerViewProps) => {
    captured.props = props
    return null
  },
}))

const codeTask: AddNodeOption = {
  description: 'Run JavaScript.',
  group: 'Blocks',
  icon: ':carbon:code:',
  id: 'javascript',
  inputs: [{ handle: 'value', jsonSchema: {} }],
  kind: 'new-task',
  label: 'JavaScript',
  outputs: [{ handle: 'result', jsonSchema: {} }],
}

const connection = (nodeId: string) => ({
  source: 'source',
  sourceHandle: 'result',
  target: nodeId,
  targetHandle: 'value',
})

describe('WorkbenchDesigner', () => {
  it('does not route externally managed Code Tasks through inline Scriptlet setup', async () => {
    const onAddNode = vi.fn(async () => 'created')
    const onOpenBlocks = vi.fn()
    const markup = renderToStaticMarkup(
      <I18nProvider i18n={createI18n('en')}>
        <WorkbenchDesigner
          addNodeOptions={[codeTask]}
          blocksOpen={false}
          disabled={false}
          inspectorOpen={false}
          model={{
            edges: [],
            nodes: [
              {
                id: 'selected',
                inputs: [],
                kind: 'task',
                outputs: [],
                position: { x: 0, y: 0 },
                reference: 'javascript',
                title: 'JavaScript',
              },
            ],
            viewport: { x: 0, y: 0, zoom: 1 },
          }}
          onAddNode={onAddNode}
          onChangeComment={() => undefined}
          onChangeInput={() => undefined}
          onChangeTaskPorts={() => undefined}
          onChangeNodeDescription={() => undefined}
          onChangeTriggerConfig={() => undefined}
          onChangeTriggerSchedule={() => undefined}
          onChangeValue={() => undefined}
          onChangeWebhook={() => undefined}
          onConnect={() => undefined}
          onCopy={() => undefined}
          onDeleteEdge={() => undefined}
          onDeleteNodes={() => undefined}
          onDuplicate={() => undefined}
          onMoveNodes={() => undefined}
          onMoveViewport={() => undefined}
          onOpenBlocks={onOpenBlocks}
          onOpenInspector={() => undefined}
          onPaste={() => undefined}
          onSelectNodes={() => undefined}
          onToggleInspector={() => undefined}
          provideAddNodeOptions={async () => undefined}
          selectedNodeIds={['selected']}
          target={{ id: 'main', kind: 'flow' }}
          theme="dark"
        />
      </I18nProvider>,
    )

    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('aria-pressed=')
    expect(markup).toContain('data-slot="badge"')
    expect(markup).not.toContain('data-slot="canvas-control-group"')
    expect(markup).not.toContain('data-canvas-control-toolbar=')
    expect(markup).toContain('designer-delete-action')
    expect(captured.props?.addItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ icon: ':carbon:code:', id: 'javascript', type: 'block' }),
        expect.objectContaining({ id: 'workbench:browse-provider-triggers', type: 'trigger' }),
      ]),
    )
    expect(captured.props?.dark).toBe(true)
    await captured.props?.onAddNode('javascript', { x: 10, y: 20 }, connection)
    expect(onAddNode).toHaveBeenCalledWith(codeTask, { x: 10, y: 20 }, connection)

    await captured.props?.onAddNode('workbench:browse-provider-triggers', { x: 10, y: 20 })
    expect(onOpenBlocks).toHaveBeenCalledOnce()
  })

  it('reports both canvas panels as expanded when they are visible', () => {
    const markup = renderToStaticMarkup(
      <I18nProvider i18n={createI18n('en')}>
        <WorkbenchDesigner
          addNodeOptions={[]}
          blocksOpen
          disabled={false}
          inspectorOpen
          model={{ edges: [], nodes: [], viewport: { x: 0, y: 0, zoom: 1 } }}
          onAddNode={async () => undefined}
          onChangeComment={() => undefined}
          onChangeInput={() => undefined}
          onChangeTaskPorts={() => undefined}
          onChangeNodeDescription={() => undefined}
          onChangeTriggerConfig={() => undefined}
          onChangeTriggerSchedule={() => undefined}
          onChangeValue={() => undefined}
          onChangeWebhook={() => undefined}
          onConnect={() => undefined}
          onCopy={() => undefined}
          onDeleteEdge={() => undefined}
          onDeleteNodes={() => undefined}
          onDuplicate={() => undefined}
          onMoveNodes={() => undefined}
          onMoveViewport={() => undefined}
          onOpenBlocks={() => undefined}
          onOpenInspector={() => undefined}
          onPaste={() => undefined}
          onSelectNodes={() => undefined}
          onToggleInspector={() => undefined}
          provideAddNodeOptions={async () => undefined}
          selectedNodeIds={[]}
          target={{ id: 'main', kind: 'flow' }}
          theme="dark"
        />
      </I18nProvider>,
    )

    expect(markup.match(/aria-expanded="true"/g)).toHaveLength(2)
  })

  it('rejects connections whose output schema cannot satisfy the input schema', () => {
    renderToStaticMarkup(
      <I18nProvider i18n={createI18n('en')}>
        <WorkbenchDesigner
          addNodeOptions={[]}
          blocksOpen={false}
          disabled={false}
          inspectorOpen={false}
          model={{
            edges: [],
            nodes: [
              {
                id: 'gmail',
                inputs: [],
                kind: 'task',
                outputs: [{ handle: 'messages', jsonSchema: { items: { type: 'object' }, type: 'array' }, nullable: false }],
                position: { x: 0, y: 0 },
                reference: 'gmail-task',
                title: 'Fetch Emails',
              },
              {
                id: 'feishu',
                inputs: [{ handle: 'text', jsonSchema: { minLength: 1, type: 'string' }, nullable: false }],
                kind: 'task',
                outputs: [],
                position: { x: 200, y: 0 },
                reference: 'feishu-task',
                title: 'Send Text Message',
              },
            ],
            viewport: { x: 0, y: 0, zoom: 1 },
          }}
          onAddNode={async () => undefined}
          onChangeComment={() => undefined}
          onChangeInput={() => undefined}
          onChangeTaskPorts={() => undefined}
          onChangeNodeDescription={() => undefined}
          onChangeTriggerConfig={() => undefined}
          onChangeTriggerSchedule={() => undefined}
          onChangeValue={() => undefined}
          onChangeWebhook={() => undefined}
          onConnect={() => undefined}
          onCopy={() => undefined}
          onDeleteEdge={() => undefined}
          onDeleteNodes={() => undefined}
          onDuplicate={() => undefined}
          onMoveNodes={() => undefined}
          onMoveViewport={() => undefined}
          onOpenBlocks={() => undefined}
          onOpenInspector={() => undefined}
          onPaste={() => undefined}
          onSelectNodes={() => undefined}
          onToggleInspector={() => undefined}
          provideAddNodeOptions={async () => undefined}
          selectedNodeIds={[]}
          target={{ id: 'main', kind: 'flow' }}
          theme="light"
        />
      </I18nProvider>,
    )

    expect(captured.props?.isValidConnection?.({ source: 'gmail', sourceHandle: 'messages', target: 'feishu', targetHandle: 'text' })).toBe(false)
  })
})
