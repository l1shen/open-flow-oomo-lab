import { describe, expect, it } from 'vitest'
import { SubsetCompareResult } from '../../src/json-schema-subset/index.ts'
import { createSchemaComparer } from '../../src/manifest/common/schemaComparer.ts'

interface CompareSchemaInfo {
  schema: object
  packageId?: string
}

function compare(info1: CompareSchemaInfo, info2: CompareSchemaInfo): { isSubset: boolean; error?: string } {
  const comparer = createSchemaComparer()
  const error: { message?: string } = {}
  const schema1 = comparer.compile(info1.schema, { ...info1, error })
  const schema2 = comparer.compile(info2.schema, { ...info2, error })
  const { result } = comparer.isSubset(schema1, schema2)
  if (result === SubsetCompareResult.True) {
    return { isSubset: true }
  }
  return { isSubset: false, error: error.message }
}

describe('json-subset-comparer', () => {
  it('rejects assigning a variable schema to a binary target', () => {
    const result = compare({ schema: { contentMediaType: 'oomol/var' } }, { schema: { contentMediaType: 'oomol/bin' } })
    expect(result.isSubset).toBe(false)
  })

  describe('var', () => {
    it('should return true for the same package', () => {
      expect(
        compare(
          {
            packageId: 'test',
            schema: { contentMediaType: 'oomol/var' },
          },
          {
            packageId: 'test',
            schema: { contentMediaType: 'oomol/var' },
          },
        ),
      ).toEqual({ isSubset: true })
    })
    it('should return false for different packages', () => {
      expect(
        compare(
          {
            packageId: 'test1',
            schema: { contentMediaType: 'oomol/var' },
          },
          {
            packageId: 'test2',
            schema: { contentMediaType: 'oomol/var' },
          },
        ),
      ).toEqual({ isSubset: false, error: 'edgeError.varDiffPkg' })
    })
    it('should return true if to is var and from is not', () => {
      expect(
        compare(
          {
            schema: { type: 'string' },
          },
          {
            packageId: 'test',
            schema: { contentMediaType: 'oomol/var' },
          },
        ),
      ).toEqual({ isSubset: true })
      expect(
        compare(
          {
            packageId: undefined,
            schema: { contentMediaType: 'oomol/bin' },
          },
          {
            packageId: 'test',
            schema: { contentMediaType: 'oomol/var' },
          },
        ),
      ).toEqual({ isSubset: true })
    })
  })

  describe('bin', () => {
    it('should return true if both are bin', () => {
      expect(
        compare(
          {
            schema: { contentMediaType: 'oomol/bin' },
          },
          {
            schema: { contentMediaType: 'oomol/bin' },
          },
        ),
      ).toEqual({ isSubset: true })
    })
    it('should return false if one is bin and the other is not', () => {
      expect(
        compare(
          {
            schema: { contentMediaType: 'oomol/bin' },
          },
          {
            schema: { type: 'string' },
          },
        ),
      ).toEqual({ isSubset: false, error: 'edgeError.binDiffType' })
    })
  })

  describe('artifact', () => {
    it('accepts only another Artifact schema', () => {
      expect(compare({ schema: { contentMediaType: 'oomol/artifact' } }, { schema: { contentMediaType: 'oomol/artifact' } })).toEqual({
        isSubset: true,
      })
      expect(compare({ schema: { contentMediaType: 'oomol/artifact' } }, { schema: { contentMediaType: 'oomol/bin' } }).isSubset).toBe(false)
    })
  })

  describe('secret', () => {
    it('accepts another secret schema', () => {
      expect(compare({ schema: { contentMediaType: 'oomol/secret' } }, { schema: { contentMediaType: 'oomol/secret' } })).toEqual({ isSubset: true })
    })

    it('rejects incompatible special values', () => {
      expect(compare({ schema: { contentMediaType: 'oomol/secret' } }, { schema: { contentMediaType: 'oomol/bin' } })).toEqual({ isSubset: false })
      expect(compare({ schema: { type: 'string' } }, { schema: { contentMediaType: 'oomol/secret' } })).toEqual({ isSubset: false })
    })

    it('allows a secret source where a string is accepted', () => {
      expect(compare({ schema: { contentMediaType: 'oomol/secret' } }, { schema: { type: 'string' } })).toEqual({ isSubset: true })
    })
  })

  describe('any', () => {
    it('should return true if one is any', () => {
      expect(
        compare(
          {
            schema: {},
          },
          {
            schema: { type: 'number' },
          },
        ),
      ).toEqual({ isSubset: true })
      expect(
        compare(
          {
            schema: { type: 'string' },
          },
          {
            schema: {},
          },
        ),
      ).toEqual({ isSubset: true })
      expect(
        compare(
          {
            schema: {},
          },
          {
            schema: {},
          },
        ),
      ).toEqual({ isSubset: true })
      expect(
        compare(
          {
            schema: {},
          },
          {
            schema: { type: 'array' },
          },
        ),
      ).toEqual({ isSubset: true })
    })
  })

  describe('array of any', () => {
    it('should return true if one is array of any and other is array', () => {
      expect(
        compare(
          {
            schema: { type: 'array', items: { type: 'string' } },
          },
          {
            schema: { type: 'array' },
          },
        ),
      ).toEqual({ isSubset: true })
      expect(
        compare(
          {
            schema: { type: 'array', items: { type: 'object' } },
          },
          {
            schema: { type: 'array' },
          },
        ),
      ).toEqual({ isSubset: true })
      expect(
        compare(
          {
            schema: { type: 'array', items: {} },
          },
          {
            schema: { type: 'array', items: { type: 'string' } },
          },
        ),
      ).toEqual({ isSubset: true })
    })

    it('accepts an object array with nested type unions', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: ['string', 'null'] },
            values: { type: 'array', items: { type: ['number', 'null'] } },
          },
          required: ['name'],
          additionalProperties: true,
        },
      }

      expect(compare({ schema }, { schema })).toEqual({ isSubset: true })
      expect(compare({ schema }, { schema: { type: 'array' } })).toEqual({ isSubset: true })
    })

    it('compares type unions directionally', () => {
      expect(compare({ schema: { type: 'string' } }, { schema: { type: ['string', 'null'] } })).toEqual({ isSubset: true })
      expect(compare({ schema: { type: ['string', 'null'] } }, { schema: { type: 'string' } })).toEqual({ isSubset: false })
      expect(compare({ schema: { type: ['string', 'null'] } }, { schema: { type: ['number', 'null'] } })).toEqual({ isSubset: false })
    })

    it('should return false if one is array of any and other is not array', () => {
      expect(
        compare(
          {
            schema: { type: 'array', items: {} },
          },
          {
            schema: { type: 'string' },
          },
        ),
      ).toEqual({ isSubset: false })
    })
  })

  describe('single select', () => {
    it('should return true if both are single select with same enum', () => {
      expect(
        compare(
          {
            schema: { enum: ['a', 'b'] },
          },
          {
            schema: { enum: ['a', 'b'] },
          },
        ),
      ).toEqual({ isSubset: true })
    })

    it('should return false if enums are different', () => {
      expect(
        compare(
          {
            schema: { enum: ['a', 'b'] },
          },
          {
            schema: { enum: ['c', 'd'] },
          },
        ),
      ).toEqual({ isSubset: false })
    })

    it('should return true if one is single select and other is string', () => {
      expect(
        compare(
          {
            schema: { enum: ['a', 'b'] },
          },
          {
            schema: { type: 'string' },
          },
        ),
      ).toEqual({ isSubset: true })
    })

    it('should return true if one is single select and other is nullable string', () => {
      expect(
        compare(
          {
            schema: { enum: ['a', 'b'] },
          },
          {
            schema: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        ),
      ).toEqual({ isSubset: true })
    })
  })

  describe('multi select', () => {
    it('should return true if both are multi select with same enum', () => {
      expect(
        compare(
          {
            schema: {
              type: 'array',
              items: { type: 'string', enum: ['a', 'b'] },
            },
          },
          {
            schema: {
              type: 'array',
              items: { type: 'string', enum: ['a', 'b'] },
            },
          },
        ),
      ).toEqual({ isSubset: true })
    })

    it('should return false if enums are different', () => {
      expect(
        compare(
          {
            schema: {
              type: 'array',
              items: { type: 'string', enum: ['a', 'b'] },
            },
          },
          {
            schema: {
              type: 'array',
              items: { type: 'string', enum: ['c', 'd'] },
            },
          },
        ),
      ).toEqual({ isSubset: false })
    })

    it('should return true if one is multi select and other is array of string', () => {
      expect(
        compare(
          {
            schema: {
              type: 'array',
              items: { type: 'string', enum: ['a', 'b'] },
            },
          },
          {
            schema: { type: 'array' },
          },
        ),
      ).toEqual({ isSubset: true })
    })

    it('should return true if one is multi select and other is nullable array of string', () => {
      expect(
        compare(
          {
            schema: {
              type: 'array',
              items: { type: 'string', enum: ['a', 'b'] },
            },
          },
          {
            schema: {
              anyOf: [{ type: 'array', items: { type: 'string' } }, { type: 'null' }],
            },
          },
        ),
      ).toEqual({ isSubset: true })
    })
  })

  describe('anyOf', () => {
    it('should return true if to has anyOf any', () => {
      expect(
        compare(
          {
            schema: { type: 'number' },
          },
          {
            schema: { anyOf: [{ type: 'string' }, {}] },
          },
        ),
      ).toEqual({ isSubset: true })
    })

    it('should return true if from is anyOf any', () => {
      expect(
        compare(
          {
            schema: { anyOf: [{}] },
          },
          {
            schema: { type: 'number' },
          },
        ),
      ).toEqual({ isSubset: true })
    })
    it('should return false if from is anyOf any with other and to is not any', () => {
      expect(
        compare(
          {
            schema: { anyOf: [{ type: 'string' }, {}] },
          },
          {
            schema: { type: 'number' },
          },
        ),
      ).toEqual({ isSubset: false })
    })

    it('should return true if one is single select and other is string', () => {
      expect(
        compare(
          {
            schema: { type: 'string', enum: ['a', 'b'] },
          },
          {
            schema: { type: 'string' },
          },
        ),
      ).toEqual({ isSubset: true })
    })
  })
})
