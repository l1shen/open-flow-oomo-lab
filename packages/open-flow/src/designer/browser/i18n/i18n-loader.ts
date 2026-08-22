import type { Locales } from 'val-i18n'

import { I18n, detectLang } from 'val-i18n'
import en from './locales/en.json'
import zh_CN from './locales/zh-CN.json'

const locales: Locales = {
  'zh-CN': zh_CN,
  'en': en,
}

export const defaultLang = 'en'

export const localeLangs: readonly string[] = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.keys(locales))

const hmrI18ns: Set<WeakRef<I18n>> = new Set()

export const createI18n = (lang: string): I18n => {
  const initLang = lang && locales[lang] ? lang : detectLang(localeLangs) || defaultLang

  if (import.meta.hot) {
    const instance = new I18n(initLang, locales)
    hmrI18ns.add(new WeakRef(instance))
    return instance
  }

  return new I18n(initLang, locales)
}

if (import.meta.hot) {
  import.meta.hot.accept(['./locales/en.json', './locales/zh-CN.json'], ([updatedEn, updatedZhCN]) => {
    for (const i18nReference of hmrI18ns) {
      const i18n = i18nReference.deref()
      if (!i18n) {
        hmrI18ns.delete(i18nReference)
        continue
      }

      i18n.locales$.set({
        ...i18n.locales,
        'en': updatedEn?.default || i18n.locales.en,
        'zh-CN': updatedZhCN?.default || i18n.locales['zh-CN'],
      })
    }
  })
}
