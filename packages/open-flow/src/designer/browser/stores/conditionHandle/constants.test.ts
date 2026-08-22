import { describe, expect, it } from 'vitest'
import { logicalSelectOptions, operatorSelectOptions, valueTypeSelectOptions } from './constants.ts'

describe('condition value type options', () => {
  it('returns independently translated options for each call', () => {
    const englishValueOptions = valueTypeSelectOptions((key) => `en:${key}`)
    const chineseValueOptions = valueTypeSelectOptions((key) => `zh:${key}`)
    const englishLogicalOptions = logicalSelectOptions((key) => `en:${key}`)
    const chineseLogicalOptions = logicalSelectOptions((key) => `zh:${key}`)
    const englishOperatorOptions = operatorSelectOptions(
      (key) => `en:${key}`,
      () => true,
    )
    const chineseOperatorOptions = operatorSelectOptions(
      (key) => `zh:${key}`,
      () => true,
    )

    expect(englishValueOptions[0]?.label).toBe('en:preset.string')
    expect(chineseValueOptions[0]?.label).toBe('zh:preset.string')
    expect(englishLogicalOptions[0]?.label).toBe('en:condition.logical.AND')
    expect(chineseLogicalOptions[0]?.label).toBe('zh:condition.logical.AND')
    expect(englishOperatorOptions[0]?.label).toBe('en:condition.operator.==')
    expect(chineseOperatorOptions[0]?.label).toBe('zh:condition.operator.==')
  })
})
