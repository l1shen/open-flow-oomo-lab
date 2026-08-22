import type { CommentNodeStore } from '../../../stores/node/commentNode.store.ts'

import { useVal } from 'use-value-enhancer'
import { SUBFLOW_VIEW_MODE } from '../../../stores/designer/subflowDesigner.store.ts'
import { DESIGNER_TYPE } from '../../../stores/designer/typings.ts'
import { NodeStore } from '../../../stores/node/node.store.ts'
import { useDesignerStore } from '../../DesignerStoreContext.tsx'
import { useSubflowViewMode } from '../../SubflowDesigner/SubflowViewModeContext.ts'

export function useShowNodeError(nodeStore: NodeStore | CommentNodeStore): boolean {
  const designerStore = useDesignerStore()
  const hasError = useVal(NodeStore.to(nodeStore)?.$.hasError)
  const subflowViewMode = useSubflowViewMode()
  const isInBlock = designerStore.designerType === DESIGNER_TYPE.Block || subflowViewMode === SUBFLOW_VIEW_MODE.Block

  return !isInBlock && !!hasError
}
