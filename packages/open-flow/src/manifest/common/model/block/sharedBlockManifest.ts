import type { ReadonlyVal } from 'value-enhancer'
import type { BlockUI } from '../../../../schema/index.ts'
import type { FileManifest } from '../../manifestTypes.ts'
import type { BlockManifest } from './base/blockManifest.ts'
import type { BlockManifestBase$ } from './internal.ts'

import { SharedBlockManifestKind } from './internal.ts'

export interface SharedBlockManifest$ extends BlockManifestBase$ {
  readonly ui: ReadonlyVal<BlockUI | undefined>
  readonly title: ReadonlyVal<string | undefined>
  readonly description: ReadonlyVal<string | undefined>
  readonly icon: ReadonlyVal<string | undefined>
  readonly private: ReadonlyVal<boolean | undefined>
}

export interface SharedBlockManifest extends BlockManifest, FileManifest {
  readonly KIND: Record<SharedBlockManifestKind, boolean> & BlockManifest['KIND']

  readonly $: SharedBlockManifest$
}

export const isSharedBlockManifest = (manifest: any): manifest is SharedBlockManifest => manifest?.KIND?.[SharedBlockManifestKind] === true

export const toSharedBlockManifest = (manifest: any): SharedBlockManifest | undefined => {
  if (isSharedBlockManifest(manifest)) {
    return manifest
  }
}
