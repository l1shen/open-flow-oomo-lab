import styles from './NodeOutline.module.scss'

import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useNodeMiniMapPhase } from '../../../components/minimap.tsx'
import { NodeMiniMapPhase } from '../../../stores/designer/nodeMiniMap.ts'
import { toInputNodeStore } from '../../../stores/node/inputNode.store.ts'
import { toOutputNodeStore } from '../../../stores/node/outputNode.store.ts'
import { useDesignerStore } from '../../DesignerStoreContext.tsx'
import { useNodeStore } from '../NodeStoreContext.tsx'
import { useShowNodeError } from './useShowNodeError.ts'

export const NodeOutline: React.FC = memo(function NodeOutline() {
  const designerStore = useDesignerStore()
  const nodeStore = useNodeStore()
  const nodeMiniMapPhase = useNodeMiniMapPhase()
  const scale = useVal(designerStore.$.scale)
  const selected = useVal(nodeStore.$.selected)
  const showError = useShowNodeError(nodeStore)
  const outlineWidth = nodeMiniMapPhase === NodeMiniMapPhase.None ? (selected ? 2 : 1) : scale

  const pseudoNodeStore = toInputNodeStore(nodeStore) || toOutputNodeStore(nodeStore)
  const pseudoNodeConnected = useVal(pseudoNodeStore?.connected$)
  const outlineColor: string | undefined = pseudoNodeConnected ? undefined : 'var(--edge-error)'

  const selectedOutlineColor: string | undefined = showError ? 'var(--edge-error)' : undefined

  return (
    <div
      style={{
        outlineWidth,
        ['--pseudo-outline-color' as any]: outlineColor,
        ['--node-selected-border-color' as any]: selectedOutlineColor,
      }}
      className={styles.outline}
    />
  )
})
