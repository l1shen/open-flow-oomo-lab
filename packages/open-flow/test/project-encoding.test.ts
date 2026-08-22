import type { JsonValue } from '../src/project/common/change.ts'

import { describe, expect, it } from 'vitest'
import { canonicalJsonBytes, digestBytes } from '../src/project/common/encoding.ts'

const decoder = new TextDecoder()

describe('canonical JSON', () => {
  it('sorts every object lexicographically and preserves JSON encoding', () => {
    const value: JsonValue = {
      z: { b: 'β', a: '雪' },
      2: 'two',
      10: 'ten',
      a: ['line\nbreak', 'quote"', null, true, false, 1.25],
    }

    expect(decoder.decode(canonicalJsonBytes(value))).toBe(
      '{"10":"ten","2":"two","a":["line\\nbreak","quote\\\"",null,true,false,1.25],"z":{"a":"雪","b":"β"}}',
    )
  })

  it('produces the same bytes and digest regardless of insertion order', async () => {
    const first: JsonValue = { nested: { right: 2, left: 1 }, values: ['a', 'b'] }
    const second: JsonValue = { values: ['a', 'b'], nested: { left: 1, right: 2 } }

    const firstBytes = canonicalJsonBytes(first)
    const secondBytes = canonicalJsonBytes(second)

    expect(secondBytes).toEqual(firstBytes)
    await expect(digestBytes(secondBytes)).resolves.toBe('sha256:e82abf7fb412ce524b010b8808597b09110d289e17ddcf0b3e989b7001087f12')
  })
})
