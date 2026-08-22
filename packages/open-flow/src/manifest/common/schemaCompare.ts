import { SubsetCompareResult } from '../../json-schema-subset/index.ts'
import { createSchemaComparer } from './schemaComparer.ts'

export interface CompareSchemaInfo {
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
    const from = comparer.compile(fromSchema.schema, { ...fromSchema, error })
    const to = comparer.compile(toSchema.schema, { ...toSchema, error })
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
