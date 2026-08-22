import type { Locales } from 'val-i18n'
import type { WorkbenchLanguage } from './contract.ts'

import { I18n } from 'val-i18n'
import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

export const languages = ['en', 'zh-CN'] as const

const locales: Locales = { en, 'zh-CN': zhCN }

export function createI18n(initialLanguage: WorkbenchLanguage = 'en'): I18n {
  return new I18n(initialLanguage, locales)
}
