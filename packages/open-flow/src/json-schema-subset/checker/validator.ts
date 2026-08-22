import type { CompiledSchema } from '../compiler/index.ts'

export const ValidResult = Object.freeze({
  Valid: 0,
  Invalid: 1,
  Unknown: 2,
})

export type ValidResult = (typeof ValidResult)[keyof typeof ValidResult]

export function valid<E>(compiledSchema: CompiledSchema<E>, value: unknown): ValidResult {
  const isValid = compiledSchema.isValid
  if (isValid) {
    const result = isValid(value)
    if (result === true) {
      return ValidResult.Valid
    } else {
      return ValidResult.Invalid
    }
  } else {
    return ValidResult.Unknown
  }
}
