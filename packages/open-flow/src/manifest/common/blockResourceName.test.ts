import type { BlockName } from './manifestTypes.ts'

import { describe, expect, it } from 'vitest'
import { decodeBlockResourceName, encodeBlockResourceName, parseBlockResourceName } from './blockResourceName.ts'

describe('block-resource-name', () => {
  it('encodes and decodes a local block reference', () => {
    const encoded = encodeBlockResourceName('greet' as BlockName)

    expect(encoded).toBe('self::greet')
    expect(decodeBlockResourceName(encoded)).toEqual({ blockName: 'greet' })
  })

  it('rejects external package references', () => {
    expect(parseBlockResourceName('example::greet').isNone()).toBe(true)
  })
})
