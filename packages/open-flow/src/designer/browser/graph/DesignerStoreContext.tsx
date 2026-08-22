import type { BlockDesignerStore } from '../stores/designer/blockDesigner.store.ts'
import type { DesignerStore } from '../stores/designer/designer.store.ts'
import type { FlowDesignerStore } from '../stores/designer/flowDesigner.store.ts'
import type { SubflowDesignerStore } from '../stores/designer/subflowDesigner.store.ts'
import type { DESIGNER_TYPE, DesignerType } from '../stores/designer/typings.ts'

import { createContext, useContext } from 'react'
import { UserLocalesProvider } from '../components/userLocales.tsx'

const DesignerStoreContext: React.Context<DesignerStore | null> = createContext<DesignerStore | null>(null)

export const DesignerStoreProvider: React.FC<{
  readonly value: DesignerStore | null
  readonly children?: React.ReactNode
}> = (props) => {
  return (
    <DesignerStoreContext.Provider value={props.value}>
      <UserLocalesProvider value={props.value?.userLocalesContext}>{props.children}</UserLocalesProvider>
    </DesignerStoreContext.Provider>
  )
}

export const useDesignerStore = (): DesignerStore => {
  const context = useContext(DesignerStoreContext)
  if (!context) {
    throw new Error('DesignerContext not found')
  }
  return context
}

export const useDesignerType = (): DesignerType => {
  return useDesignerStore().designerType
}

type MapDesignerTypeToStore = {
  [DESIGNER_TYPE.Flow]: FlowDesignerStore
  [DESIGNER_TYPE.Block]: BlockDesignerStore
  [DESIGNER_TYPE.Subflow]: SubflowDesignerStore
}

export function useDesignerStoreAs<T extends DESIGNER_TYPE>(type: T): MapDesignerTypeToStore[T] | null {
  const store = useDesignerStore()
  if (store.designerType === type) {
    return store as MapDesignerTypeToStore[T]
  }
  return null
}
