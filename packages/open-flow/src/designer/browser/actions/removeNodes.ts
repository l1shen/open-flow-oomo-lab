import type { ReactiveMap } from 'value-enhancer/collections'
import type { FlowLikeMeta } from '../../../manifest/common/meta/flowLike/flowLikeMeta.ts'
import type { NodeId } from '../../../schema/index.ts'
import type { DesignerUIStore } from '../stores/designer/designerUI.store.ts'
import type { NodeStore } from '../stores/node/node.store.ts'

import { inertFilterMap } from '@wopjs/cast'
import { send } from '@wopjs/event'
import { cleanRemovedCommentNodeTranslationKeys, cleanRemovedNodesTranslationKeys } from '../../../manifest/common/meta/package/userLocaleCleaner.ts'
import { CommentNodeStore } from '../stores/node/commentNode.store.ts'

export function removeNodes(
  flowLikeMeta: FlowLikeMeta,
  commentNodes: ReactiveMap<NodeId, CommentNodeStore>,
  designerUIStore: DesignerUIStore,
  toRemoveNodes: Iterable<NodeStore | CommentNodeStore>,
): void {
  const all = [...toRemoveNodes]
  const nodeStores: NodeStore[] = []
  let removedCommentNodes = false
  for (const item of all) {
    if (CommentNodeStore.is(item)) {
      commentNodes.delete(item.nodeId)
      removedCommentNodes = true
      cleanRemovedCommentNodeTranslationKeys(flowLikeMeta.packageMeta, item)
      continue
    }
    nodeStores.push(item)
  }

  const nodeMetas = inertFilterMap(nodeStores, (nodeStore) => flowLikeMeta.nodes.get(nodeStore.nodeId) ?? undefined)
  flowLikeMeta.removeNodes(nodeMetas)
  designerUIStore.removeNodeLayouts(nodeMetas.map((nodeMeta) => nodeMeta.nodeId))

  if (removedCommentNodes || nodeMetas.length > 0) {
    send(designerUIStore.onChanged, designerUIStore)
  }

  cleanRemovedNodesTranslationKeys(flowLikeMeta.packageMeta, nodeMetas)
}
