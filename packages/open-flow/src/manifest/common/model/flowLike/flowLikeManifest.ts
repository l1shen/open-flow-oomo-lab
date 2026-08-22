import type { ReadonlyVal } from 'value-enhancer'
import type { ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { HandleOutputFrom, NodeId } from '../../../../schema/index.ts'
import type { FileManifest } from '../../manifestTypes.ts'
import type { NodeManifest } from '../node/nodeManifest.ts'

import { FlowLikeManifestKind } from './internal.ts'

export interface FlowLikeManifest$ {
  readonly outputs_from: ReadonlyVal<readonly HandleOutputFrom[] | undefined>
}

export interface FlowLikeManifest extends FileManifest {
  readonly KIND: Record<FlowLikeManifestKind, boolean>

  readonly nodes: ReadonlyReactiveMap<NodeId, NodeManifest>
}

export const isFlowLikeManifest = (manifest: any): manifest is FlowLikeManifest => manifest?.KIND?.[FlowLikeManifestKind] === true

export const toFlowLikeManifest = (manifest: any): FlowLikeManifest | undefined => {
  if (isFlowLikeManifest(manifest)) {
    return manifest
  }
}
