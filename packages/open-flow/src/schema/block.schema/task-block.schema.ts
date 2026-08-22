import { z } from 'zod'
import { ExecutorSchema } from '../executor.schema/index.ts'
import { InputHandleDefSchema, OutputHandleDefSchema } from '../handle.schema.ts'
import { BlockBase } from './block-base.ts'

export const TaskBlockSchema = /* @__PURE__ */ z
  .strictObject({
    ...BlockBase,
    executor: ExecutorSchema,
    private: z.boolean().optional().default(false).describe('Hide the task from the blocks list and exclude it from AI tools'),
    additional_inputs: z.union([z.boolean(), InputHandleDefSchema]).optional().describe('Allow additional inputs def to be added on node'),
    additional_outputs: z.union([z.boolean(), OutputHandleDefSchema]).optional().describe('Allow additional outputs def to be added on node'),
    additional_inputs_def: z.array(InputHandleDefSchema).optional().describe('Default node.inputs_def'),
    additional_outputs_def: z.array(OutputHandleDefSchema).optional().describe('Default node.outputs_def'),
  })
  .describe('Task Block defines a single executable Task')
