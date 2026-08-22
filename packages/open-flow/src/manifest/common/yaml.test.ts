import { describe, expect, it } from 'vitest'
import { writeYamlMap, writeYamlSeq } from './yaml.ts'

describe('yaml', () => {
  it('should write array to an undefined node', () => {
    const result = writeYamlSeq(undefined, [{ handle: 'a', value: [] }])

    expect(result.toJSON()).toEqual([{ handle: 'a', value: [] }])
  })

  it('should write map to an undefined node', () => {
    const result = writeYamlMap(undefined, { a: 1 })

    expect(result.toJSON()).toEqual({ a: 1 })
  })
})
