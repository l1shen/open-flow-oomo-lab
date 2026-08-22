import styles from './NodeBody.module.scss'
import type { HandleName } from '../../../../../schema/index.ts'

import { memo, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { CommentNodeStore } from '../../../stores/node/commentNode.store.ts'
import { ErrorNodeStore } from '../../../stores/node/errorNode.store.ts'
import { NodeStore } from '../../../stores/node/node.store.ts'
import { SubflowNodeStore } from '../../../stores/node/subflowNode.store.ts'
import { TaskNodeStore } from '../../../stores/node/taskNode.store.ts'
import { TriggerNodeStore } from '../../../stores/node/triggerNode.store.ts'
import { NodeSectionReconciler } from '../../NodeSection/NodeSectionReconciler.tsx'
import { InputHandleDndContext } from '../inputHandleDnd.ts'
import { useNodeStore } from '../NodeStoreContext.tsx'
import { CommentNodeContent } from './CommentNodeContent.tsx'
import { EmptyNodeContent } from './EmptyNodeContent.tsx'
import { ErrorNodeContent } from './ErrorNodeContent.tsx'
import { TriggerNodeContent } from './TriggerNodeContent.tsx'

export const NodeBody: React.FC = /* @__PURE__ */ memo(function NodeBody() {
  const nodeStore = useNodeStore()
  const sections = useVal(nodeStore.display$?.sections)
  const runtimeSections = useVal(NodeStore.to(nodeStore)?.runtimeSections$)
  const triggerPresentation = useVal(TriggerNodeStore.is(nodeStore) ? nodeStore.display$.presentation : undefined)
  const inputHandleDnd = useState<HandleName>()
  const allSections = [...(sections ?? []), ...(runtimeSections ?? [])]

  const sectionKeys: Record<string, number> = {}
  const sectionKey = (type: string): string => {
    sectionKeys[type] ??= 0
    sectionKeys[type]++
    return `${type}-${sectionKeys[type]}`
  }

  return (
    <div className={`${styles.container} nopan`}>
      {(TaskNodeStore.is(nodeStore) || SubflowNodeStore.is(nodeStore)) && <EmptyNodeContent store={nodeStore} />}
      {ErrorNodeStore.is(nodeStore) && <ErrorNodeContent store={nodeStore} />}
      {TriggerNodeStore.is(nodeStore) && <TriggerNodeContent store={nodeStore} />}
      <InputHandleDndContext.Provider value={inputHandleDnd}>
        {triggerPresentation == null && allSections.map((section) => <NodeSectionReconciler key={sectionKey(section.type)} section={section} />)}
      </InputHandleDndContext.Provider>
      {CommentNodeStore.is(nodeStore) && <CommentNodeContent store={nodeStore} />}
    </div>
  )
})
