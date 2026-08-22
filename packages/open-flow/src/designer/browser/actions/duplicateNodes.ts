import type { ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { FlowLikeMeta } from '../../../manifest/common/meta/flowLike/flowLikeMeta.ts'
import type { WritableNodeManifest } from '../../../manifest/common/writable/node/writableNodeManifest.ts'
import type { NodeId } from '../../../schema/index.ts'
import type { PackageAuthoring } from '../../common/packageAuthoring.ts'
import type { XYPosition } from '../base/compare.ts'
import type { DesignerUIStore } from '../stores/designer/designerUI.store.ts'
import type { NodeStore } from '../stores/node/node.store.ts'

import { inertFilterMap, isDefined, isString } from '@wopjs/cast'
import { isSharedBlockMeta } from '../../../manifest/common/meta/block/shared/sharedBlockMeta.ts'
import { WritableInlineTaskBlockManifest } from '../../../manifest/common/writable/block/writableInlineTaskBlockManifest.ts'
import { WritableSubflowNodeManifest } from '../../../manifest/common/writable/node/writableSubflowNodeManifest.ts'
import { WritableTaskNodeManifest } from '../../../manifest/common/writable/node/writableTaskNodeManifest.ts'
import { DEFAULT_DUPLICATE_NODE_OFFSET } from '../serviceConstants.ts'

export async function duplicateNodes(
  packageAuthoring: PackageAuthoring,
  flowLikeMeta: FlowLikeMeta,
  nodes: ReadonlyReactiveMap<NodeId, NodeStore>,
  designerUIStore: DesignerUIStore,
  nodeIds: NodeId[],
  offset: XYPosition = DEFAULT_DUPLICATE_NODE_OFFSET,
): Promise<void> {
  const nodeManifests: WritableNodeManifest[] = []
  for (const reNodeId of nodeIds) {
    const refNodeMeta = flowLikeMeta.nodes.get(reNodeId)
    if (!refNodeMeta) {
      continue
    }
    if (!packageAuthoring.canWriteScriptlets && refNodeMeta.$.scriptletEntry.value) {
      continue
    }

    const [nodeId, nodeIdIndex] = flowLikeMeta.produceNodeId(reNodeId)

    const nodeManifest = refNodeMeta.manifest.clone(nodeId)

    // A duplicate may replace a translation reference with its displayed value.
    nodeManifest.$$.title.set(flowLikeMeta.produceNodeTitle(nodeManifest.$.title.value, nodeIdIndex))
    // Preserve literal values and remove connections.
    if (nodeManifest.$$.inputs_from.value) {
      nodeManifest.$$.inputs_from.set(
        inertFilterMap(nodeManifest.$$.inputs_from.value, (f) => (isDefined(f.value) ? { handle: f.handle, value: f.value } : undefined)),
      )
    }

    if (WritableTaskNodeManifest.is(nodeManifest)) {
      const task = nodeManifest.$.task.value
      if (WritableInlineTaskBlockManifest.is(task)) {
        const refNodeScriptletPath = refNodeMeta.$.scriptletEntry.value
        if (refNodeScriptletPath) {
          // Keep scriptlet allocation sequential so duplicate entry names remain deterministic.
          // oxlint-disable-next-line no-await-in-loop
          const newEntry = await packageAuthoring.packageMeta.scriptlets.duplicateScriptlet(flowLikeMeta.manifestDir, refNodeScriptletPath)

          const executor = task.$.executor.value
          if (executor?.name == 'javascript') {
            task.$$.executor.set({
              ...executor,
              options: { ...executor.options, entry: newEntry },
            })
          }
        }
      } else if (isString(task)) {
        const blockMeta = refNodeMeta.$.blockMeta.value
        if (isSharedBlockMeta(blockMeta)) {
          nodeManifest.$$.task.set(blockMeta.blockResourceName)
        }
      }
    } else if (WritableSubflowNodeManifest.is(nodeManifest)) {
      const blockMeta = refNodeMeta.$.blockMeta.value
      if (isSharedBlockMeta(blockMeta)) {
        nodeManifest.$$.subflow.set(blockMeta.blockResourceName)
      }
    }

    nodeManifests.push(nodeManifest)

    const refNodeStore = nodes.get(refNodeMeta.nodeId)
    if (refNodeStore) {
      const position = refNodeStore.$.position.value
      const defaultWidth = refNodeStore.uiStore.$.contentWidth.value

      designerUIStore.setNodeUIData(nodeId, {
        contentWidth: defaultWidth,
        rfNode: {
          selected: true,
          position: position ? { x: position.x + offset.x, y: position.y + offset.y } : undefined,
        },
      })
    }
  }

  // migrateNodeStores projects manifest nodes asynchronously.
  // Select every duplicate in one update after that projection settles.
  flowLikeMeta.upsertNodeManifests(nodeManifests)
}
