import type { LocaleTextStore } from '../../../../../localization/common/localization.ts'

import { fixTranslateKey, toUserTranslateKey } from '../../../base/trivial.ts'

// Dragging a handle copies its metadata, including a potentially localized description.
// Preserve localization keys within one package and clone their values across packages.
export function cloneLocalesIfNeeded(
  str: string | undefined,
  sourceUserLocales: LocaleTextStore | undefined,
  targetUserLocales: LocaleTextStore | undefined,
): string | undefined {
  if (!str) {
    return str
  }

  const key = toUserTranslateKey(str)
  // Plain descriptions can be copied directly.
  if (!key) {
    return str
  }

  // Preserve the key when both handles belong to the same package.
  if (sourceUserLocales && targetUserLocales && sourceUserLocales === targetUserLocales) {
    return str
  }

  // Omit the description instead of creating a dangling localization key.
  if (!sourceUserLocales || !targetUserLocales) {
    return undefined
  }

  // Copy translations between different packages.
  const sourceEnglish = sourceUserLocales['en'].value
  const sourceChinese = sourceUserLocales['zh-CN'].value
  if (!sourceEnglish[key] && !sourceChinese[key]) {
    // The source key has no translated value.
    return undefined
  }

  // Create a collision-free key in the target package.
  const newKey = fixTranslateKey(fixTranslateKey(key, targetUserLocales['en'].value), targetUserLocales['zh-CN'].value)
  // Copy each available locale independently.
  if (sourceEnglish[key]) {
    const targetEnglish = targetUserLocales['en']
    targetEnglish.set({ ...targetEnglish.value, [newKey]: sourceEnglish[key] })
  }
  if (sourceChinese[key]) {
    const targetChinese = targetUserLocales['zh-CN']
    targetChinese.set({ ...targetChinese.value, [newKey]: sourceChinese[key] })
  }
  return `%${newKey}%`
}
