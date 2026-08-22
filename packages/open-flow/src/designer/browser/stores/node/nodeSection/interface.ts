import type { ReadonlyVal } from 'value-enhancer'
import type { HandleName } from '../../../../../schema/index.ts'
import type { ConditionRowStore } from '../../conditionHandle/conditionRow.store.ts'
import type { HandleRowStore } from '../../nodeHandle/handleRow.store.ts'
import type { HandleIndex } from '../constants.ts'

export type NodeSectionStoreType = string

export interface INodeSectionStore<TState = unknown> {
  readonly type: NodeSectionStoreType
  readonly hasError$: ReadonlyVal<boolean>
  readonly uiState$: ReadonlyVal<TState>
  readonly dispose: () => void
}

export interface IHandleRowDragNDrop extends INodeSectionStore {
  grabHandleRow(handle: HandleName): HandleRowStore | ConditionRowStore | undefined
  /** @internal Returns the new handle name, or undefined when creation fails. */
  dropHandleRow(index: HandleIndex | null | undefined, row: HandleRowStore | ConditionRowStore, insertBefore?: boolean): HandleName | undefined
}
