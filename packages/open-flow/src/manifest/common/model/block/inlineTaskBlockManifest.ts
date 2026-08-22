import type { ReadonlyVal } from 'value-enhancer'
import type { Executor, InlineTaskBlock } from '../../../../schema/index.ts'
import type { InlineBlockManifest, InlineBlockManifest$ } from './inlineBlockManifest.ts'

import { InlineTaskBlockManifestKind } from './internal.ts'

export interface InlineTaskBlockManifest$ extends InlineBlockManifest$ {
  readonly executor: ReadonlyVal<Executor | undefined>
}

export interface InlineTaskBlockManifest extends InlineBlockManifest {
  readonly KIND: Record<InlineTaskBlockManifestKind, boolean> & InlineBlockManifest['KIND']

  readonly $: InlineTaskBlockManifest$

  toJSON(): InlineTaskBlock
}

export const isInlineTaskBlockManifest = (manifest: any): manifest is InlineTaskBlockManifest => manifest?.KIND?.[InlineTaskBlockManifestKind] === true

export const toInlineTaskBlockManifest = (manifest: any): InlineTaskBlockManifest | undefined => {
  if (isInlineTaskBlockManifest(manifest)) {
    return manifest
  }
}
