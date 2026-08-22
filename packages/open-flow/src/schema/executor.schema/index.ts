import { z } from 'zod'
import { ConnectorExecutorSchema } from './connector.executor.schema.ts'
import { JavascriptExecutorSchema } from './javascript.executor.schema.ts'
import { LlmExecutorSchema } from './llm.executor.schema.ts'

export * from './connector.executor.schema.ts'
export * from './javascript.executor.schema.ts'
export * from './llm.executor.schema.ts'

export const ExecutorSchema = /* @__PURE__ */ z.discriminatedUnion('name', [JavascriptExecutorSchema, ConnectorExecutorSchema, LlmExecutorSchema])
