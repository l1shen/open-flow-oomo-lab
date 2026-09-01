import { SubsetCompareResult } from '../../json-schema-subset/index.ts'
import { createSchemaComparer } from './schemaComparer.ts'

export interface CompareSchemaInfo {
  readonly nullable?: boolean
  readonly schema: object
  readonly packageId: string | undefined
}

export interface CompatibleCompareResult {
  readonly kind: 'compatible'
}

export interface IncompatibleCompareResult {
  readonly kind: 'incompatible'
  readonly error?: string
  readonly errorPath?: readonly (string | number)[]
}

export interface CompareErrorResult {
  readonly kind: 'compare-error'
  readonly message: string
}

export type CompareResult = CompatibleCompareResult | IncompatibleCompareResult | CompareErrorResult

const comparer = createSchemaComparer()

function nullableSchema(schema: object, nullable: boolean | undefined): object {
  return nullable ? { anyOf: [schema, { type: 'null' }] } : schema
}

export function normalizeNullableSchemaPath(
  path: readonly (string | number)[] | undefined,
  nullable: boolean | undefined,
): readonly (string | number)[] | undefined {
  if (path == null || !nullable || path.length === 0 || path[0] !== 'anyOf') return path
  return path[1] === 0 ? path.slice(2) : undefined
}

export function compareJSONSchema(fromSchema: CompareSchemaInfo, toSchema: CompareSchemaInfo): CompareResult {
  try {
    const error: { message?: string } = {}
    const from = comparer.compile(nullableSchema(resolveLocalRefs(fromSchema.schema), fromSchema.nullable), { ...fromSchema, error })
    const to = comparer.compile(nullableSchema(resolveLocalRefs(toSchema.schema), toSchema.nullable), { ...toSchema, error })
    const { result, errorPath } = comparer.isSubset(from, to)
    if (result == SubsetCompareResult.True) {
      return { kind: 'compatible' }
    } else {
      return { kind: 'incompatible', error: error.message, errorPath }
    }
  } catch (error) {
    return { kind: 'compare-error', message: error instanceof Error ? error.message : String(error) }
  }
}

function resolveLocalRefs(schema: object): object {
  function target(reference: string): unknown {
    if (reference == '#') return schema
    if (!reference.startsWith('#/')) return
    let value: unknown = schema
    for (const encoded of reference.slice(2).split('/')) {
      if (value == null || typeof value != 'object' || Array.isArray(value)) return
      const token = encoded.replaceAll('~1', '/').replaceAll('~0', '~')
      if (!Object.hasOwn(value, token)) return
      value = (value as Readonly<Record<string, unknown>>)[token]
    }
    return value
  }

  function visit(value: unknown, references: ReadonlySet<string>): unknown {
    if (Array.isArray(value)) return value.map((item) => visit(item, references))
    if (value == null || typeof value != 'object') return value
    const source = value as Readonly<Record<string, unknown>>
    const reference = typeof source.$ref == 'string' && source.$ref.startsWith('#') ? source.$ref : undefined
    if (reference != null) {
      if (references.has(reference)) throw new TypeError(`Cyclic local JSON Schema reference "${reference}".`)
      const resolved = target(reference)
      if (resolved === undefined) throw new TypeError(`Local JSON Schema reference "${reference}" does not exist.`)
      const nextReferences = new Set(references)
      nextReferences.add(reference)
      const siblings = Object.fromEntries(
        Object.entries(source)
          .filter(([key]) => key != '$ref' && key != '$defs' && key != 'definitions')
          .map(([key, item]) => [key, visit(item, nextReferences)]),
      )
      const result = visit(resolved, nextReferences)
      return Object.keys(siblings).length == 0 ? result : { allOf: [result, siblings] }
    }
    return Object.fromEntries(
      Object.entries(source)
        .filter(([key]) => key != '$defs' && key != 'definitions')
        .map(([key, item]) => [key, visit(item, references)]),
    )
  }

  return visit(schema, new Set()) as object
}
