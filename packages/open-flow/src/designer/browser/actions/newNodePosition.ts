import type { NodeMeta } from '../../../manifest/common/meta/nodeMeta.ts'
import type { NodeId } from '../../../schema/index.ts'
import type { DesignerUIStore } from '../stores/designer/designerUI.store.ts'
import type { NodeStore } from '../stores/node/node.store.ts'
import type { NodeUIPersistedData } from '../stores/node/nodeUI.store.ts'

interface Rectangle {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const SAFE_POSITION: number = -1e5
const DEFAULT_WIDTH: number = 450
const DEFAULT_HEIGHT: number = 600
const GAP = 150

export function autoSetNewNodePositions(
  nodeMetas: ReadonlyMap<NodeId, NodeMeta>,
  nodeStores: ReadonlyMap<NodeId, NodeStore>,
  designerUIStore: DesignerUIStore,
): void {
  const toBePlaced: NodeId[] = []

  // Track the top-left bound.
  let left = -SAFE_POSITION
  let top = -SAFE_POSITION

  // Track the bottom-right bound.
  let right = SAFE_POSITION
  let bottom = SAFE_POSITION

  for (const { nodeId } of nodeMetas.values()) {
    const rect = getNodeRect(nodeStores.get(nodeId), designerUIStore.peekNodeUIData(nodeId))
    if (rect) {
      left = Math.min(left, rect.x)
      top = Math.min(top, rect.y)
      right = Math.max(right, rect.x + rect.width)
      bottom = Math.max(bottom, rect.y + rect.height)
    } else {
      toBePlaced.push(nodeId)
    }
  }

  if (right === SAFE_POSITION) {
    left = top = right = bottom = 0
  }

  if (toBePlaced.length === 0) return

  // Place new nodes from the bottom-right bound.
  let x = right - left > DEFAULT_HEIGHT ? right + GAP : right
  let y = bottom - top > DEFAULT_HEIGHT ? bottom - DEFAULT_HEIGHT : top
  for (const nodeId of toBePlaced) {
    if (designerUIStore.peekNodeUIData(nodeId) == null) {
      designerUIStore.setNodeUIData(nodeId, {
        rfNode: { position: { x, y } },
      })
    }
    x += DEFAULT_WIDTH + GAP
  }
}

function getNodeRect(nodeStore: NodeStore | undefined, uiData: NodeUIPersistedData | undefined): Rectangle | undefined {
  if (nodeStore) {
    const { position, measured } = nodeStore.$.rfNode.value
    const width = measured?.width ?? DEFAULT_WIDTH
    const height = measured?.height ?? DEFAULT_HEIGHT
    return { ...position, width, height }
  } else if (uiData?.rfNode?.position) {
    const { position, measured } = uiData.rfNode
    const x = position.x ?? 0
    const y = position.y ?? 0
    const width = measured?.width ?? DEFAULT_WIDTH
    const height = measured?.height ?? DEFAULT_HEIGHT
    return { x, y, width, height }
  }
}
