import { glob, readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import en from '../../src/designer/browser/i18n/locales/en.json'
import zhCN from '../../src/designer/browser/i18n/locales/zh-CN.json'

function flattenLocale(locale: object, prefix: string = '', keys: Set<string> = new Set()): Set<string> {
  for (const [name, value] of Object.entries(locale)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (typeof value == 'string') {
      keys.add(key)
    } else if (value && typeof value == 'object' && !Array.isArray(value)) {
      flattenLocale(value, key, keys)
    }
  }
  return keys
}

describe('Designer translations', () => {
  const enKeys = flattenLocale(en)
  const zhCNKeys = flattenLocale(zhCN)

  it('keeps English and Chinese locale keys aligned', () => {
    expect([...enKeys].filter((key) => !zhCNKeys.has(key))).toEqual([])
    expect([...zhCNKeys].filter((key) => !enKeys.has(key))).toEqual([])
  })

  it('defines every statically referenced product translation', async () => {
    const missing = new Set<string>()
    const keyPattern = /(?:\b(?:t|t\$|translate)|\.t)\(\s*(['"`])([^'"`$]+)\1/g

    for await (const file of glob('src/designer/browser/**/*.{ts,tsx}')) {
      if (file.includes('/icons/IconPicker/')) continue
      const source = await readFile(file, 'utf8')
      for (const match of source.matchAll(keyPattern)) {
        const key = match[2]
        if (!enKeys.has(key) || !zhCNKeys.has(key)) missing.add(key)
      }
    }

    expect([...missing].toSorted()).toEqual([])
  })
})
