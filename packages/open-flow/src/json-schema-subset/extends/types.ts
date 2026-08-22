import type { ExpressionSingleResult } from '../expression/index.ts'

export interface ExtendsSchemaClass {
  new (id: number, value: unknown, payload?: unknown): ExtendsSchema
  isMatch(value: unknown): boolean
}

export interface ExtendsSchema {
  readonly id: number
  compare(other: unknown): readonly ExpressionSingleResult[]
  equals(other: unknown): boolean
}
