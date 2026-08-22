import type { ZodType } from 'zod'

import { parseDocument } from 'yaml'

export interface SourceDiagnostic {
  readonly message: string
  readonly path?: string
}

export type SourceValidator = (source: string) => readonly SourceDiagnostic[]

export function createYamlSourceValidator(schema: ZodType): SourceValidator {
  return (source) => {
    try {
      const document = parseDocument(source, { uniqueKeys: true })
      if (document.errors.length > 0) return document.errors.map((error) => ({ message: error.message }))

      const value: unknown = document.toJS()
      const result = schema.safeParse(value)
      if (result.success) return []
      return result.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.length > 0 ? `/${issue.path.join('/')}` : undefined,
      }))
    } catch (error) {
      return [{ message: error instanceof Error ? error.message : String(error) }]
    }
  }
}
