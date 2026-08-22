import type { DeepReadonly } from '../utils.ts'
import type { CompiledValue as InnerCompiledValue, CompiledObject as InnerCompiledObject, CompiledSchema as InnerCompiledSchema } from './wrapper.ts'

export type { CompilableSchema, InputSchema, CompileResult } from './compiler.ts'
export type CompiledValue = DeepReadonly<InnerCompiledValue>
export type CompiledObject = DeepReadonly<InnerCompiledObject>
export type CompiledSchema<E> = DeepReadonly<InnerCompiledSchema<E>>

export { compile } from './compiler.ts'
export { isCompiledSchema, isCompiledObject, getId, getKind, getPath, assertCompiledValue, CompiledKind, ANY, NEVER } from './wrapper.ts'
export type { SchemaPath } from './wrapper.ts'
