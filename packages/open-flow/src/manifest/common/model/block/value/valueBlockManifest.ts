import type { ReadonlyVal } from 'value-enhancer'
import type { ValueHandleDef } from '../../../../../schema/index.ts'
import type { BlockManifest } from '../base/blockManifest.ts'

import { ValueBlockManifestKind } from '../internal.ts'

export interface ValueBlockManifest$ {
  readonly values: ReadonlyVal<ValueHandleDef[] | undefined>
}

export interface ValueBlockManifest extends BlockManifest {
  readonly KIND: Record<ValueBlockManifestKind, boolean> & BlockManifest['KIND']

  readonly $: ValueBlockManifest$
}

export const isValueBlockManifest = (block: any): block is ValueBlockManifest => block?.KIND?.[ValueBlockManifestKind] === true

export const toValueBlockManifest = (block: unknown): ValueBlockManifest | undefined => {
  if (isValueBlockManifest(block)) {
    return block
  }
}
