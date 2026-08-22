import type { BlockManifest } from './base/blockManifest.ts'
import type { BlockManifestBase$ } from './internal.ts'

import { InlineBlockManifestKind } from './internal.ts'

export interface InlineBlockManifest$ extends BlockManifestBase$ {}

export interface InlineBlockManifest extends BlockManifest {
  readonly KIND: Record<InlineBlockManifestKind, boolean> & BlockManifest['KIND']

  readonly $: InlineBlockManifest$
}

export const isInlineBlockManifest = (manifest: any): manifest is InlineBlockManifest => manifest?.KIND?.[InlineBlockManifestKind] === true

export const toInlineBlockManifest = (manifest: any): InlineBlockManifest | undefined => {
  if (isInlineBlockManifest(manifest)) {
    return manifest
  }
}
