import { z } from 'zod'
import { ConditionHandleDefSchema, DefaultConditionHandleDefSchema } from '../handle.schema.ts'

export const InlineConditionBlockSchema = /* @__PURE__ */ z
  .strictObject({
    cases: z.array(ConditionHandleDefSchema).optional().describe('Block cases Handle definitions'),
    default: /* @__PURE__ */ DefaultConditionHandleDefSchema.optional().describe('Block default Handle definition'),
  })
  .describe('Inline Condition Block defines a set of conditions to evaluate and route data accordingly.')
