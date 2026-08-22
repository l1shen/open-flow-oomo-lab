import type { HandleSchemaOverridesItem } from '../../schema/index.ts'

import { z } from 'zod'
import { HandleSchemaOverridesItemSchema } from '../../schema/index.ts'

const handleSchemaOverridesSchema = z.array(HandleSchemaOverridesItemSchema)

export function parseHandleSchemaOverrides(value: unknown): HandleSchemaOverridesItem[] | undefined {
  const result = handleSchemaOverridesSchema.safeParse(value)
  return result.success ? result.data : undefined
}
