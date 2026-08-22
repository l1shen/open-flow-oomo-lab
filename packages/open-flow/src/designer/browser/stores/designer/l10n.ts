import type { ComputeGet, ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextMap, LocaleTextStore } from '../../../../localization/common/localization.ts'

import { getOwnValue, isEnglish } from '../../base/trivial.ts'

export function getNextLang(current: string | undefined): string {
  return current === 'en' ? 'zh-CN' : 'en'
}

/** Returns the English locale for English-looking values, otherwise the requested locale. */
export function getProperLocale$(userLocales: LocaleTextStore, lang: string, value: string): Val<LocaleTextMap> {
  if (value && isEnglish(value)) {
    return userLocales.en
  }
  return userLocales[lang] || userLocales['en']
}

export function localize(data: LocaleTextStore, lang$: ReadonlyVal<string>, get: ComputeGet, key: string, defaultValue?: string): string {
  const lang = get(lang$)
  const locale$ = data[lang] || data['en']

  let value = getOwnValue(get(locale$), key)
  if (value) return value

  const fallbackLocale$ = locale$ === data['en'] ? data['zh-CN'] : data['en']
  value = getOwnValue(get(fallbackLocale$), key)
  if (value) return value

  return defaultValue ?? key
}
