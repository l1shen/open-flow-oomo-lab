import type { CompilableSchema, CompileResult } from './compiler/index.ts'
import type { CompiledSchemaErrorItem, SchemaErrorItem } from './error.ts'
import type { Schema } from './types.ts'

import { SchemaError, stringifySchemaError } from './error.ts'

export type Compiler<E> = (schema: CompilableSchema<E>) => CompileResult<E> | readonly SchemaErrorItem<E>[]

export function preprocessSchema<E>(schema: CompilableSchema<E>, compile: Compiler<E>, printWarnLog = false): Schema<E> {
  const schemaResult = compile(schema)
  if (Array.isArray(schemaResult)) {
    const errorItems: SchemaErrorItem[] = []
    collectWithPathPrefix(errorItems, schemaResult, '$')
    throw new SchemaError(errorItems)
  }
  const { schema: compiledSchema, warns } = schemaResult as CompileResult<E>
  if (printWarnLog && warns.length > 0) {
    console.warn(`found ${warns.length} warns after compile schema`)
    for (const warn of warns) {
      console.warn(stringifySchemaError(warn))
    }
  }
  return compiledSchema
}

export function preprocessSchemasPair<E>(
  schema1: CompilableSchema<E>,
  schema2: CompilableSchema<E>,
  compile: Compiler<E>,
  printWarnLog = false,
): [Schema<E>, Schema<E>] {
  const schemaResult1 = compile(schema1)
  const schemaResult2 = compile(schema2)

  if (Array.isArray(schemaResult1) || Array.isArray(schemaResult2)) {
    const errorItems: SchemaErrorItem[] = []

    if (Array.isArray(schemaResult1)) {
      collectWithPathPrefix(errorItems, schemaResult1, '$1')
    }
    if (Array.isArray(schemaResult2)) {
      collectWithPathPrefix(errorItems, schemaResult2, '$2')
    }
    throw new SchemaError(errorItems)
  }
  const { schema: compiledSchema1, warns: superWarns } = schemaResult1 as CompileResult<E>
  const { schema: compiledSchema2, warns: subWarns } = schemaResult2 as CompileResult<E>

  if (printWarnLog) {
    if (superWarns.length > 0) {
      console.warn(`found ${superWarns.length} warns after compile superSchema`)
    }
    for (const warn of superWarns) {
      console.warn(stringifySchemaError(warn))
    }
    if (subWarns.length > 0) {
      console.warn(`found ${subWarns.length} warns after compile subSchema`)
    }
    for (const warn of subWarns) {
      console.warn(stringifySchemaError(warn))
    }
  }
  return [compiledSchema1, compiledSchema2]
}

function collectWithPathPrefix(errorItems: SchemaErrorItem[], compiledItems: readonly CompiledSchemaErrorItem[], prefix: number | string): void {
  for (const compiledItem of compiledItems) {
    const replacedItem: SchemaErrorItem = {
      ...compiledItem,
      path: [prefix, ...compiledItem.path],
    }
    errorItems.push(replacedItem)
  }
}
