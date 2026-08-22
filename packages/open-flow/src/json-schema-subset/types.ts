import type { CompiledSchema } from './compiler/index.ts'
import type { ExtendsSchema } from './extends/index.ts'

export type Schema<E> = ExtendsSchema | CompiledSchema<E>
export interface JSONDelegate<E = unknown> {
  isSchema(schema: object): boolean | readonly E[]
  compile(schema: object): (value: unknown) => boolean | readonly E[]
}
