import { z } from 'zod'

export const JavascriptExecutorNameSchema = /* @__PURE__ */ z.literal('javascript').describe('JavaScript Executor Name')

export const JavascriptExecutorSchema = /* @__PURE__ */ z
  .strictObject({
    name: JavascriptExecutorNameSchema,
    options: /* @__PURE__ */ z.strictObject({
      entry: /* @__PURE__ */ z.string().min(1).describe('Portable JavaScript or TypeScript entry file'),
      function: /* @__PURE__ */ z.string().min(1).optional().describe('Exported function name; defaults to the default export'),
    }),
  })
  .describe('JavaScript Executor runs a portable bundled Task')
