import type { Val } from 'value-enhancer'
import type { ReactiveMap } from 'value-enhancer/collections'
import type { HandleOutputFrom, NodeId } from '../../../../schema/index.ts'
import type { FlowLikeManifest } from '../../model/flowLike/flowLikeManifest.ts'
import type { WritableFileManifest } from '../../writableFileManifest.ts'
import type { WritableNodeManifest } from '../node/writableNodeManifest.ts'

export interface FlowLikeManifest$$ {
  readonly outputs_from: Val<readonly HandleOutputFrom[] | undefined>
}

export interface WritableFlowLikeManifest extends WritableFileManifest, FlowLikeManifest {
  readonly $$: FlowLikeManifest$$

  /** @internal */
  readonly nodeManifests: ReactiveMap<NodeId, WritableNodeManifest>
}
