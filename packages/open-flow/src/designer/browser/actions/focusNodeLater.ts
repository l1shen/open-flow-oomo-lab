import type { NodeId } from '../../../schema/index.ts'
import type { DesignerStore } from '../stores/designer/designer.store.ts'
import type { RFCommand } from '../stores/designer/rfCommand.ts'

// Wait for the editor tab to mount before centering the node.
export function focusNodeLater(rfCommand: RFCommand, nodeId: NodeId): void {
  setTimeout(() => {
    rfCommand.send('focusNode', nodeId)
  }, 100)
}

export function selectAndFocusNodeLater(designerStore: DesignerStore, nodeId: NodeId): boolean {
  const node = designerStore.$.nodes.get(nodeId)
  if (node == null) return false
  designerStore.prepareDeselectNodesAndEdges()()
  node.$$.selected.set(true)
  focusNodeLater(designerStore.rfCommand, nodeId)
  return true
}
