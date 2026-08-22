import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { SharedBlockManifest, SharedBlockManifest$ } from '../../model/block/sharedBlockManifest.ts'
import type { WritableBlockManifest } from './writableBlockManifest.ts'

export type WritableSharedBlockManifest$$ = {
  [K in keyof SharedBlockManifest$]: WritableReactive<SharedBlockManifest$[K]>
}

export interface WritableSharedBlockManifest extends WritableBlockManifest, SharedBlockManifest {
  readonly $$: WritableSharedBlockManifest$$

  readonly KIND: SharedBlockManifest['KIND']
}
