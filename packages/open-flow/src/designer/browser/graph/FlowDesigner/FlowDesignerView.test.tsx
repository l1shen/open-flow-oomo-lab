import type { HandleName } from '../../../../schema/index.ts'
import type { FlowDesignerProps } from './FlowDesigner.tsx'
import type {
  FlowDesignerViewCommentNode,
  FlowDesignerViewModel,
  FlowDesignerViewProps,
  FlowDesignerViewTaskNode,
  FlowDesignerViewValueNode,
} from './FlowDesignerView.tsx'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InputSectionStore } from '../../stores/node/nodeSection/inputSection.store.ts'
import { OutputSectionStore } from '../../stores/node/nodeSection/outputSection.store.ts'
import { FlowDesignerView } from './FlowDesignerView.tsx'

const hooks = vi.hoisted(() => ({
  effectIndex: 0,
  effects: [] as (readonly unknown[] | undefined)[],
  memo: undefined as unknown,
  refIndex: 0,
  refs: [] as { current: unknown }[],
}))

vi.mock('virtual:uno.css', () => ({}))

vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>()
  const effect = (callback: () => unknown, dependencies?: readonly unknown[]) => {
    const index = hooks.effectIndex++
    const previous = hooks.effects[index]
    hooks.effects[index] = dependencies
    if (
      dependencies == null ||
      previous == null ||
      dependencies.length != previous.length ||
      dependencies.some((dependency, dependencyIndex) => dependency !== previous[dependencyIndex])
    )
      void callback()
  }
  return {
    ...original,
    useCallback: <T,>(callback: T) => callback,
    useEffect: effect,
    useLayoutEffect: effect,
    useMemo: <T,>(factory: () => T) => {
      hooks.effectIndex = 0
      hooks.refIndex = 0
      return (hooks.memo ??= factory()) as T
    },
    useRef: <T,>(value: T) => {
      const index = hooks.refIndex++
      return (hooks.refs[index] ??= { current: value }) as { current: T }
    },
  }
})

const task = (inputs: FlowDesignerViewTaskNode['inputs']): FlowDesignerViewTaskNode => ({
  id: 'target',
  inputs,
  kind: 'task',
  outputs: [{ handle: 'result', jsonSchema: {} }],
  position: { x: 200, y: 0 },
  reference: 'task',
  title: 'Task',
})

const source: FlowDesignerViewTaskNode = {
  id: 'source',
  inputs: [],
  kind: 'task',
  outputs: [{ handle: 'result', jsonSchema: {} }],
  position: { x: 0, y: 0 },
  reference: 'source-task',
  title: 'Source',
}

const model = (nodes: FlowDesignerViewModel['nodes']): FlowDesignerViewModel => ({ nodes, viewport: { x: 0, y: 0, zoom: 1 } })

const valueNode = (content: unknown): FlowDesignerViewValueNode => ({
  id: 'value',
  inputs: [],
  kind: 'value',
  outputs: [{ handle: 'value', jsonSchema: {} }],
  position: { x: 0, y: 0 },
  title: 'Value',
  values: [{ handle: 'value', jsonSchema: {}, value: content }],
})

const commentNode = (title: string): FlowDesignerViewCommentNode => ({
  content: '',
  id: 'comment',
  kind: 'comment',
  position: { x: 0, y: 100 },
  title,
})

function props(value: FlowDesignerViewModel, overrides: Partial<FlowDesignerViewProps> = {}): FlowDesignerViewProps {
  return {
    addItems: [],
    editable: true,
    identity: 'flow:main',
    model: value,
    onAddNode: () => undefined,
    onConnect: () => undefined,
    onDeleteNodes: () => undefined,
    onDisconnect: () => undefined,
    onDuplicate: () => undefined,
    onMoveNodes: () => undefined,
    onMoveViewport: () => undefined,
    onPaste: () => undefined,
    onSelectionChange: () => undefined,
    selectedNodeIds: [],
    ...overrides,
  }
}

function update(initial: FlowDesignerViewProps, next: FlowDesignerViewProps): FlowDesignerProps['flowDesignerStore'] {
  const view = FlowDesignerView(initial) as React.ReactElement<FlowDesignerProps>
  FlowDesignerView(next)
  return view.props.flowDesignerStore
}

describe('FlowDesignerView model synchronization', () => {
  beforeEach(() => {
    hooks.effectIndex = 0
    hooks.effects = []
    hooks.memo = undefined
    hooks.refIndex = 0
    hooks.refs = []
  })

  it('does not clear an input value after the model replaces it with a connection', async () => {
    const onChangeInput = vi.fn()
    const initial = task([{ handle: 'value', jsonSchema: {}, value: null }])
    const connected = task([{ handle: 'value', jsonSchema: {}, sources: [{ nodeId: 'source', output: 'result' }] }])
    const store = update(props(model([source, initial]), { onChangeInput }), props(model([source, connected]), { onChangeInput }))

    await Promise.resolve()

    expect(onChangeInput).not.toHaveBeenCalled()
    store.dispose()
  })

  it('restores editable handle controls for inline code Tasks only', async () => {
    const onChangeTaskPorts = vi.fn()
    const editable = { ...task([{ handle: 'value', jsonSchema: {} }]), editablePorts: true }
    const view = FlowDesignerView(props(model([editable]), { onChangeTaskPorts })) as React.ReactElement<FlowDesignerProps>
    const node = [...view.props.flowDesignerStore.$.nodes.values()][0]!
    const inputSection = node.findSection<InputSectionStore>(InputSectionStore.TYPE)!
    const outputSection = node.findSection<OutputSectionStore>(OutputSectionStore.TYPE)!

    expect(inputSection.role).toBe('author')
    expect(outputSection.role).toBe('author')
    expect(inputSection.renameHandle('value' as HandleName, 'message' as HandleName)).toBe(true)
    expect(outputSection.renameHandle('result' as HandleName, 'text' as HandleName)).toBe(true)
    await Promise.resolve()

    expect(onChangeTaskPorts).toHaveBeenLastCalledWith(
      'target',
      [expect.objectContaining({ handle: 'message' })],
      [expect.objectContaining({ handle: 'text' })],
    )
    inputSection.addNewHandle()
    outputSection.deleteHandle('text' as HandleName)
    await Promise.resolve()
    expect(onChangeTaskPorts).toHaveBeenLastCalledWith(
      'target',
      [expect.objectContaining({ handle: 'message' }), expect.objectContaining({ handle: 'input' })],
      [],
    )
    view.props.flowDesignerStore.dispose()
  })

  it('restores editable handle controls when a read-only view becomes editable', () => {
    const editable = { ...task([{ handle: 'value', jsonSchema: {} }]), editablePorts: true }
    const store = update(props(model([editable]), { editable: false }), props(model([editable]), { editable: true }))
    const node = [...store.$.nodes.values()][0]!

    expect(node.findSection<InputSectionStore>(InputSectionStore.TYPE)?.role).toBe('author')
    expect(node.findSection<OutputSectionStore>(OutputSectionStore.TYPE)?.role).toBe('author')
    store.dispose()
  })

  it('does not echo model-owned Value and Comment updates back to the host', async () => {
    const onChangeComment = vi.fn()
    const onChangeValue = vi.fn()
    const store = update(
      props(model([valueNode('before'), commentNode('Before')]), { onChangeComment, onChangeValue }),
      props(model([valueNode('after'), commentNode('After')]), { onChangeComment, onChangeValue }),
    )

    await Promise.resolve()

    expect(onChangeComment).not.toHaveBeenCalled()
    expect(onChangeValue).not.toHaveBeenCalled()
    store.dispose()
  })

  it('does not rewrite an unchanged controlled selection on a host rerender', () => {
    const value = model([task([])])
    const view = FlowDesignerView(props(value, { selectedNodeIds: ['target'] })) as React.ReactElement<FlowDesignerProps>
    const node = [...view.props.flowDesignerStore.$.nodes.values()][0]!
    const setSelection = vi.spyOn(node.$$.selected, 'set')
    const replaceNodes = vi.spyOn(view.props.flowDesignerStore.$$.nodes, 'replace')

    FlowDesignerView(props(value, { selectedNodeIds: ['target'] }))

    expect(setSelection).not.toHaveBeenCalled()
    expect(replaceNodes).not.toHaveBeenCalled()
    view.props.flowDesignerStore.dispose()
  })

  it('consumes one focus request once without changing selection and disables motion when requested by the user', () => {
    const onSelectionChange = vi.fn()
    const initial = props(model([task([])]), { onSelectionChange })
    const view = FlowDesignerView(initial) as React.ReactElement<FlowDesignerProps>
    const send = vi.spyOn(view.props.flowDesignerStore.rfCommand, 'send')
    const focusNodeRequest = { nodeId: 'target', requestId: 1 }
    const focused = props(model([task([])]), { focusNodeRequest, onSelectionChange })
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    try {
      FlowDesignerView(focused)
      FlowDesignerView(focused)

      expect(send).toHaveBeenCalledOnce()
      expect(send).toHaveBeenCalledWith('focusNode', 'target', { duration: 0 })
      expect(onSelectionChange).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      view.props.flowDesignerStore.dispose()
    }
  })

  it('forwards connection validation through React Flow identities', () => {
    const isValidConnection = vi.fn(() => false)
    const view = FlowDesignerView(props(model([source, task([])]), { isValidConnection })) as React.ReactElement<FlowDesignerProps>

    expect(
      view.props.isValidConnection?.({
        source: 'm:source',
        sourceHandle: 'h:result',
        target: 'm:target',
        targetHandle: 'h:value',
      }),
    ).toBe(false)
    expect(isValidConnection).toHaveBeenCalledWith({ source: 'source', sourceHandle: 'result', target: 'target', targetHandle: 'value' })
    view.props.flowDesignerStore.dispose()
  })

  it('forwards a generic dropped item at its Flow position without serializing the item', () => {
    const onAddNode = vi.fn()
    const view = FlowDesignerView(props(model([]), { onAddNode })) as React.ReactElement<FlowDesignerProps>

    view.props.onDropAddItem?.('connector:github:create-issue', { x: 120, y: 80 })

    expect(onAddNode).toHaveBeenCalledWith('connector:github:create-issue', { x: 120, y: 80 })
    view.props.flowDesignerStore.dispose()
  })
})
