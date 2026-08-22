import type { ReadonlyVal } from 'value-enhancer'
import type { NodeId } from '../../../../schema/index.ts'
import type { ValueBlockManifest } from '../block/value/valueBlockManifest.ts'
import type { NodeManifestKind } from './internal.ts'
import type { NodeManifest, NodeManifest$ } from './nodeManifest.ts'

import { ValueNodeManifestKind } from './internal.ts'

export interface ValueNodeManifest$ extends NodeManifest$ {
  // The API nests values.$.values even though the persisted data has one level.
  readonly values: ReadonlyVal<ValueBlockManifest | undefined>
}

export interface ValueNodeManifest extends NodeManifest {
  readonly KIND: Record<ValueNodeManifestKind | NodeManifestKind, boolean>

  readonly nodeType: 'value'

  readonly $: ValueNodeManifest$

  clone(nodeId: NodeId): ValueNodeManifest
}

export const isValueNodeManifest = (node: any): node is ValueNodeManifest => node?.KIND?.[ValueNodeManifestKind] === true

export const toValueNodeManifest = (node: unknown): ValueNodeManifest | undefined => {
  if (isValueNodeManifest(node)) {
    return node
  }
}
