import type { ReadonlyVal } from 'value-enhancer'
import type { TriggerDefinitionSnapshot } from '../../../../schema/index.ts'
import type { FlowLikeManifest, FlowLikeManifest$ } from '../flowLike/flowLikeManifest.ts'
import type { FlowLikeManifestKind } from '../flowLike/internal.ts'

import { FlowManifestKind } from './internal.ts'

export function isFlowManifest(manifest: any): manifest is FlowManifest {
  return manifest?.KIND?.[FlowManifestKind] === true
}

export function toFlowManifest(manifest: any): FlowLikeManifest | undefined {
  if (isFlowManifest(manifest)) {
    return manifest
  }
}

export interface FlowManifest$ extends FlowLikeManifest$ {
  title: ReadonlyVal<string | undefined>
  icon: ReadonlyVal<string | undefined>
  description: ReadonlyVal<string | undefined>
  trigger_definitions: ReadonlyVal<readonly TriggerDefinitionSnapshot[] | undefined>
}

export interface FlowManifest extends FlowLikeManifest {
  readonly KIND: Record<FlowManifestKind | FlowLikeManifestKind, boolean>

  readonly $: FlowManifest$
}
