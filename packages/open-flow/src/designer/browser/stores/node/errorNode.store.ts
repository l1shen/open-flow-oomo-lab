import type { ReadonlyVal, Val } from 'value-enhancer'
import type { HandleName, NodeId } from '../../../../schema/index.ts'
import type { Mutable } from '../../base/typing.ts'
import type { DesignerUIStore } from '../designer/designerUI.store.ts'
import type { ErrorMessage, NodeStatus } from './constants.ts'
import type { NodeStore$ } from './node.store.ts'

import { val } from 'value-enhancer'
import { MIN_NODE_WIDTH, NODE_STATUS, NODE_TYPE } from './constants.ts'
import { NodeStore } from './node.store.ts'

export interface ErrorObject {
  message: string
  stack?: string
}

export interface ErrorNodeStoreProps {
  error: ErrorMessage | ErrorObject | undefined
  designerUIStore: DesignerUIStore
  outputHandles: ReadonlyVal<readonly HandleName[]>
}

export function parseError(error: ErrorMessage | ErrorObject | undefined): [message?: string, stack?: string] {
  if (typeof error === 'string') {
    error = error.trimEnd()
    const nl = error.indexOf('\n')
    if (nl >= 0) {
      return [error.slice(0, nl), error.slice(nl + 1)]
    } else {
      return [error, undefined]
    }
  } else if (error) {
    return [error.message, error.stack]
  } else {
    return [undefined, undefined]
  }
}

const ICON_WARNING = ':carbon:warning-alt:#F7B500:'

export class ErrorNodeStore extends NodeStore {
  public static override is(store: unknown): store is ErrorNodeStore {
    return NodeStore.is(store) && store.nodeType === NODE_TYPE.ErrorNode
  }

  public readonly error$: Val<ErrorMessage | ErrorObject | undefined>
  public readonly outputHandles$: ReadonlyVal<readonly HandleName[]>

  public constructor(nodeId: NodeId, props: ErrorNodeStoreProps) {
    const icon = val(ICON_WARNING)
    const title = val<string | undefined>(nodeId)
    const description = val()
    const timeout = val()
    const progressWeight = val()
    const status = val<NodeStatus>(NODE_STATUS.Idle)
    const progress = val()
    const showSettings = val()
    const sections = val([])
    const inputs_def = val([])
    const outputs_def = val([])

    super(nodeId, NODE_TYPE.ErrorNode, {
      display$: {
        icon,
        title,
        description,
        timeout,
        progressWeight,
        status,
        progress,
        showSettings,
        sections,
        inputs_def,
        outputs_def,
        ignore: val(),
      },
      designerUIStore: props.designerUIStore,
    })

    this.uiStore.$$.contentWidth.set(MIN_NODE_WIDTH)

    this.error$ = this.dispose.add(val(props.error))
    this.outputHandles$ = this.dispose.add(props.outputHandles)

    this.dispose.flush(this.$.hasError)
    ;(this.$ as Mutable<NodeStore$>).hasError = this.dispose.add(val(true))
  }
}
