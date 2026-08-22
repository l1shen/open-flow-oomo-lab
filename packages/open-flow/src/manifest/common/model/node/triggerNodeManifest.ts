import type { ReadonlyVal } from 'value-enhancer'
import type { NodeId, TriggerDescriptor } from '../../../../schema/index.ts'
import type { NodeManifestKind, TriggerNodeManifestKind } from './internal.ts'
import type { NodeManifest, NodeManifest$ } from './nodeManifest.ts'

import { TriggerNodeManifestKind as Kind } from './internal.ts'

export interface TriggerNodeManifest$ extends NodeManifest$ {
  readonly trigger: ReadonlyVal<TriggerDescriptor | undefined>
}

export interface TriggerNodeManifest extends NodeManifest {
  readonly KIND: Record<NodeManifestKind | TriggerNodeManifestKind, boolean>
  readonly nodeType: 'trigger'
  readonly $: TriggerNodeManifest$
  clone(nodeId: NodeId): TriggerNodeManifest
}

export const isTriggerNodeManifest = (node: any): node is TriggerNodeManifest => node?.KIND?.[Kind] === true

export const toTriggerNodeManifest = (node: unknown): TriggerNodeManifest | undefined => {
  if (isTriggerNodeManifest(node)) return node
}
