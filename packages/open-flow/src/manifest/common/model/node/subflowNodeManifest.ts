import type { ReadonlyVal } from 'value-enhancer'
import type { NodeId } from '../../../../schema/index.ts'
import type { BlockResourceName } from '../../manifestTypes.ts'
import type { NodeManifestKind } from './internal.ts'
import type { NodeManifest, ScheduledNodeManifest$ } from './nodeManifest.ts'

import { SubflowNodeManifestKind } from './internal.ts'

export interface SubflowNodeManifest$ extends ScheduledNodeManifest$ {
  readonly subflow: ReadonlyVal<BlockResourceName | undefined>
}

export interface SubflowNodeManifest extends NodeManifest {
  readonly KIND: Record<SubflowNodeManifestKind | NodeManifestKind, boolean>

  readonly nodeType: 'subflow'

  readonly $: SubflowNodeManifest$

  clone(nodeId: NodeId): SubflowNodeManifest
}

export const isSubflowNodeManifest = (node: any): node is SubflowNodeManifest => node?.KIND?.[SubflowNodeManifestKind] === true

export const toSubflowNodeManifest = (node: any): SubflowNodeManifest | undefined => {
  if (isSubflowNodeManifest(node)) {
    return node
  }
}
