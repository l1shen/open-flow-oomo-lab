import type { ReadonlyVal } from 'value-enhancer'
import type { NodeId } from '../../../../../schema/index.ts'
import type { FlowLikeManifest, FlowLikeManifest$ } from '../../flowLike/flowLikeManifest.ts'
import type { SharedBlockManifest, SharedBlockManifest$ } from '../sharedBlockManifest.ts'

import { SubflowBlockManifestKind } from '../internal.ts'

export interface SubflowBlockManifest$ extends SharedBlockManifest$, FlowLikeManifest$ {
  readonly forward_previews: ReadonlyVal<NodeId[] | undefined>
}

export interface SubflowBlockManifest extends SharedBlockManifest, FlowLikeManifest {
  readonly KIND: Record<SubflowBlockManifestKind, boolean> & SharedBlockManifest['KIND'] & FlowLikeManifest['KIND']

  readonly $: SubflowBlockManifest$
}

export const isSubflowBlockManifest = (block: any): block is SubflowBlockManifest => block?.KIND?.[SubflowBlockManifestKind] === true

export const toSubflowBlockManifest = (block: unknown): SubflowBlockManifest | undefined => {
  if (isSubflowBlockManifest(block)) {
    return block
  }
}
