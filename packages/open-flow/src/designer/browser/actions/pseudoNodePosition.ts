import type { DesignerStore } from '../stores/designer/designer.store.ts'

import { isUndefinedPosition } from '../stores/node/node.store.ts'

/**
 * Positions pseudo nodes after the node maps initialize but before any node is measured.
 */
export function setupPseudoNodesPositioning(designerStore: DesignerStore): void {
  if (!designerStore.$.pseudoNodes) return

  // Find the top-left bound of the workflow nodes.
  let x = NaN
  let y = NaN
  for (const node of designerStore.$.nodes.values()) {
    const position = node.$.position.value
    if (!Number.isFinite(x) || position.x < x) {
      x = position.x
    }
    if (!Number.isFinite(y) || position.y < y) {
      y = position.y
    }
  }
  if (!(Number.isFinite(x) && Number.isFinite(y))) {
    x = y = 0
  }

  // Place pseudo nodes above the workflow graph.
  y -= 200

  // Spread pseudo nodes horizontally from that point.
  for (const pseudoNode of designerStore.$.pseudoNodes.values()) {
    if (isUndefinedPosition(pseudoNode.$.position.value)) {
      pseudoNode.$$.position.set({ x, y })
      x += 1000
    }
  }
}
