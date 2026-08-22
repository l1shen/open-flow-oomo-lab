import { z } from 'zod'

export const LlmExecutorNameSchema = /* @__PURE__ */ z.literal('llm').describe('LLM Executor Name')

export const LlmExecutorSchema = /* @__PURE__ */ z
  .strictObject({
    name: LlmExecutorNameSchema,
    options: /* @__PURE__ */ z.strictObject({
      mode: /* @__PURE__ */ z.enum(['chat', 'json']).describe('Return text or structured outputs.'),
    }),
  })
  .describe('LLM Executor calls an OpenAI-compatible chat completion API.')
