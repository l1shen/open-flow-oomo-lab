import { z } from 'zod'
import { SubflowBlockSchema } from './subflow-block.schema.ts'
import { TaskBlockSchema } from './task-block.schema.ts'

export { BlockUISchema } from './block-base.ts'

export const BlockSchema = /* @__PURE__ */ z.union([TaskBlockSchema, SubflowBlockSchema])
