import { z } from 'zod'

export const HandleSchemaOverridesPathSchema = /* @__PURE__ */ z
  .union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])
  .describe('Path to value')

export const HandleSchemaOverridesItemSchema = /* @__PURE__ */ z.strictObject({
  'path': HandleSchemaOverridesPathSchema.optional(),
  'schema': z.any().optional().describe('Set new schema'),
  'ui:options': z
    .strictObject({
      selected: z.number().optional(),
    })
    .optional(),
})
