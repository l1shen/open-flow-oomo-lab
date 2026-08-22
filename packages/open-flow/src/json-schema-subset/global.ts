import type { CompilableSchema, InputSchema } from './compiler/index.ts'
import type { ExtendsSchemaClass } from './extends/index.ts'
import type { Compiler } from './preprocessing.ts'
import type { Schema } from './types.ts'
import type { JSONDelegate } from './types.ts'

import { checkWithResult } from './checker/checker.ts'
import { compile } from './compiler/index.ts'
import { hasContainedBy, hasContaining, hasEquals, hasIntersection, hasRejection } from './expression/index.ts'
import { ExtendsContext } from './extends/index.ts'
import { preprocessSchema, preprocessSchemasPair } from './preprocessing.ts'

export type MakingParams<E> = {
  readonly extendsSchemaClasses?: readonly ExtendsSchemaClass[]
  readonly delegate?: JSONDelegate<E>
}

export interface SubsetCompare<E> {
  compile(schema: InputSchema, payload?: unknown, printWarnLog?: boolean): Schema<E>
  isSubset(superSchema: CompilableSchema<E>, subSchema: CompilableSchema<E>, printWarnLog?: boolean): SubsetComparison
}

export interface SubsetComparison {
  readonly errorPath?: readonly (string | number)[] | undefined
  readonly result: SubsetCompareResult
}

export const SubsetCompareResult = Object.freeze({
  True: 0,
  False: 1,
  Unknown: 2,
})

export type SubsetCompareResult = (typeof SubsetCompareResult)[keyof typeof SubsetCompareResult]

export function makeSubsetCompare<E = unknown>({ extendsSchemaClasses, delegate }: MakingParams<E> = {}): SubsetCompare<E> {
  const extendsContext = new ExtendsContext(extendsSchemaClasses)
  const comparer: SubsetCompare<E> = Object.freeze({
    compile: (schema: InputSchema, payload?: unknown, printWarnLog?: boolean): Schema<E> => {
      const compiler: Compiler<E> = (candidate) => compile(candidate, extendsContext, payload, delegate)
      return preprocessSchema(schema, compiler, printWarnLog)
    },
    isSubset: (superSchema: CompilableSchema<E>, subSchema: CompilableSchema<E>, printWarnLog = false): SubsetComparison => {
      const compiler: Compiler<E> = (candidate) => compile(candidate, extendsContext, undefined, delegate)
      const [schema1, schema2] = preprocessSchemasPair(superSchema, subSchema, compiler, printWarnLog)
      const { errorPath, expression } = checkWithResult(extendsContext, schema1, schema2)
      const foundTrueExpression = hasEquals(expression) || hasContainedBy(expression)
      const foundFalseExpression = hasContaining(expression) || hasIntersection(expression) || hasRejection(expression)

      if (foundTrueExpression && !foundFalseExpression) {
        return { result: SubsetCompareResult.True }
      }
      if (!foundTrueExpression && foundFalseExpression) {
        return { errorPath, result: SubsetCompareResult.False }
      }
      return { result: SubsetCompareResult.Unknown }
    },
  })
  return comparer
}
