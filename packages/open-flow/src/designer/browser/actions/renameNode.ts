import type { FlowLikeMeta } from '../../../manifest/common/meta/flowLike/flowLikeMeta.ts'
import type { NodeId } from '../../../schema/index.ts'
import type { DesignerUIStore } from '../stores/designer/designerUI.store.ts'
import type { NodeStore } from '../stores/node/node.store.ts'

export function renameNode(
  nodes: ReadonlyMap<NodeId, NodeStore>,
  designerUIStore: DesignerUIStore,
  flowLikeMeta: FlowLikeMeta,
  oldNodeId: NodeId,
  newNodeId: NodeId,
): void {
  const oldNodeStore = nodes.get(oldNodeId)
  if (oldNodeStore) {
    designerUIStore.setNodeUIData(newNodeId, {
      ...oldNodeStore.uiStore.toUIData(),
      showSettings: oldNodeStore.display$.showSettings.value,
    })
  }
  if (!flowLikeMeta.renameNode(oldNodeId, newNodeId)) {
    // Remove the copied UI data when the manifest rename fails.
    designerUIStore.takeNodeUIData(newNodeId)
  } else {
    designerUIStore.renameNodeLayout(oldNodeId, newNodeId)
  }
}
