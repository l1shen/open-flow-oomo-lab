import { z } from 'zod'
import { ExecutorSchema } from '../executor.schema/index.ts'
import { InlineBlockBase } from './block-base.ts'

export const InlineTaskBlockSchema = /* @__PURE__ */ z
  .strictObject({
    ...InlineBlockBase,
    executor: ExecutorSchema,
  })
  .describe('Inline Task Block defines a single executable Task in Node')
