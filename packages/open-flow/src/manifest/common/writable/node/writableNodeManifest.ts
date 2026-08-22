import type { EventReceiver } from 'remitter'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { NodeId } from '../../../../schema/index.ts'
import type { NodeManifest, NodeManifest$ } from '../../model/node/nodeManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlParent } from '../../yaml.ts'

export interface WritableNodeManifest$ extends NodeManifest$ {}

export type WritableNodeManifest$$ = {
  [K in keyof NodeManifest$]: WritableReactive<NodeManifest$[K]>
}
export interface WritableNodeManifestEvents {
  changed: void
}

export interface WritableNodeManifest extends NodeManifest {
  readonly $$: WritableNodeManifest$$
  readonly onYamlParentUpdated: OnYamlParentUpdated
  readonly yamlParent: YamlParent
  readonly events: EventReceiver<WritableNodeManifestEvents>
  clone(nodeId: NodeId): WritableNodeManifest
}
