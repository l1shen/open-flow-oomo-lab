import type { InlineBlockManifest } from '../../model/block/inlineBlockManifest.ts'
import type { WritableBlockManifest } from './writableBlockManifest.ts'

export interface WritableInlineBlockManifest extends InlineBlockManifest, WritableBlockManifest {
  readonly KIND: InlineBlockManifest['KIND']
}
