import { z } from 'zod'
import { GroupDividerDefSchema, InputHandleDefSchema, OutputHandleDefSchema } from '../handle.schema.ts'

export const BlockUISchema = /* @__PURE__ */ z.strictObject({
  default_width: z.number().optional().describe('Default node width'),
})

export const InlineBlockBase = {
  inputs_def: z
    .array(z.union([InputHandleDefSchema, GroupDividerDefSchema]))
    .optional()
    .describe('Block input Handles definitions'),
  outputs_def: z
    .array(z.union([OutputHandleDefSchema, GroupDividerDefSchema]))
    .optional()
    .describe('Block output Handles definitions'),
}

export const BlockBase = {
  ...InlineBlockBase,
  ui: /* @__PURE__ */ BlockUISchema.optional().describe('UI settings of the block'),
  title: z.string().optional().describe('Block display title'),
  description: z.string().optional().describe('Block display description'),
  icon: z.string().optional().describe('Path to a icon image for the Block'),
}
