import styles from './NodeMinimap.module.scss'

import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { NODE_HANDLE_CLASSNAME } from '../../../base/designer.ts'
import { useNodeMiniMapPhase } from '../../../components/minimap.tsx'
import { NodeMiniMapPhase } from '../../../stores/designer/nodeMiniMap.ts'
import { useDesignerStore } from '../../DesignerStoreContext.tsx'
import { useNodeStore } from '../NodeStoreContext.tsx'
import { NodeProgress } from './NodeProgress.tsx'

export const NodeMinimap: React.FC = /* @__PURE__ */ memo(function NodeMinimap() {
  const nodeMiniMapPhase = useNodeMiniMapPhase()

  if (nodeMiniMapPhase !== NodeMiniMapPhase.None) {
    return <NodeMimimapContent />
  } else {
    return null
  }
})

function NodeMimimapContent() {
  const designerStore = useDesignerStore()
  const nodeStore = useNodeStore()
  const { status, progress } = nodeStore.display$ || {}

  const scale = useVal(designerStore.$.scale)

  return (
    <div style={{ ['--oo-designer-scale' as any]: scale }} className={`${styles.wrapper} ${NODE_HANDLE_CLASSNAME}`}>
      <NodeProgress variant="minimap" progress$={progress} status$={status} />
    </div>
  )
}
