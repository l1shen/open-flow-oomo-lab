import type { SubflowViewMode } from '../../stores/designer/subflowDesigner.store.ts'

import { createContext, useContext } from 'react'

export const SubflowViewModeContext: React.Context<SubflowViewMode | null> = /*#__PURE__*/ createContext<SubflowViewMode | null>(null)

export function useSubflowViewMode(): SubflowViewMode | null {
  return useContext(SubflowViewModeContext)
}
