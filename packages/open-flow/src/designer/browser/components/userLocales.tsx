import type { AddEventListener } from '@wopjs/event'
import type { LocaleTextStore } from '../../../localization/common/localization.ts'

import { createContext, useContext } from 'react'

export interface TranslateKeyEvent {
  readonly lang: string
  /** The old value remains available at `locales[lang][oldKey]`. */
  readonly oldKey: string
  /** `null` indicates that `oldKey` was removed. */
  readonly newKey: string | null
}

export interface UserLocalesContext {
  readonly userLocales?: LocaleTextStore
  readonly onDidChangeTranslateKey?: AddEventListener<TranslateKeyEvent>
}

const context = /*#__PURE__*/ createContext<UserLocalesContext | undefined>(undefined)

export const UserLocalesProvider: React.Provider<UserLocalesContext | undefined> = /*#__PURE__*/ (() => context.Provider)()

export function useUserLocalesContext(): UserLocalesContext | undefined {
  return useContext(context)
}
