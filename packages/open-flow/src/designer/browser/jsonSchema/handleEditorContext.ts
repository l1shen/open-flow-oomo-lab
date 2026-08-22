import type { SecretStore } from '../../../secret/browser/store.ts'

import { createContext, useContext } from 'react'

export interface HandleEditorContext {
  readonly secretStore?: SecretStore
}

const context = /*#__PURE__*/ createContext<HandleEditorContext | null>(null)

export const HandleEditorProvider: React.Provider<HandleEditorContext | null> = /*#__PURE__*/ (() => context.Provider)()

export function useHandleEditorContext(): HandleEditorContext {
  const value = useContext(context)
  if (!value) {
    throw new Error('HandleEditorContext not found')
  }
  return value
}
