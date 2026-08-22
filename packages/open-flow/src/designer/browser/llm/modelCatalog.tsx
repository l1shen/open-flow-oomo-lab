import { createContext, useContext } from 'react'

export interface LlmModelCatalog {
  listLlmModels(signal?: AbortSignal): Promise<LlmModelCatalogResult>
}

export interface LlmModelCatalogResult {
  readonly available: boolean
  readonly models: readonly string[]
}

export interface LlmModelCatalogProviderProps {
  readonly catalog: LlmModelCatalog
  readonly children: React.ReactNode
}

const LlmModelCatalogContext = createContext<LlmModelCatalog | null>(null)

export function LlmModelCatalogProvider(props: LlmModelCatalogProviderProps): React.ReactElement {
  return <LlmModelCatalogContext.Provider value={props.catalog}>{props.children}</LlmModelCatalogContext.Provider>
}

export function useLlmModelCatalog(): LlmModelCatalog | null {
  return useContext(LlmModelCatalogContext)
}
