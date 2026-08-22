import type { HandleName, NodeId, TaskNode } from '../../schema/index.ts'
import type { LlmExecutorMode } from './model.ts'

import { maximumLlmOutputTokens } from './model.ts'

function messageSchema() {
  return {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['role', 'content'],
      properties: {
        role: { enum: ['system', 'user', 'assistant'] },
        content: { type: 'string' },
      },
    },
  }
}

function messageWidgetSchema(title: string) {
  return {
    ...messageSchema(),
    'ui:widget': 'llm/messages',
    'ui:options': { title },
  }
}

const modelSchema = {
  'type': 'object',
  'ui:widget': 'llm/model',
  'ui:options': { title: 'Model options' },
  'additionalProperties': false,
  'properties': {
    model: { type: 'string' },
    temperature: { type: 'number', minimum: 0, maximum: 2 },
    top_p: { type: 'number', minimum: 0, maximum: 1 },
    max_tokens: { type: 'integer', minimum: 1, maximum: maximumLlmOutputTokens },
  },
}

function handle(value: string): HandleName {
  return value as HandleName
}

export function llmNode(mode: LlmExecutorMode, nodeId: NodeId, title: string = mode == 'chat' ? 'LLM Chat' : 'LLM Structured Output'): TaskNode {
  const output = { handle: handle('output'), description: 'Generated response.', json_schema: { type: 'string' } }
  return {
    node_id: nodeId,
    title,
    icon: ':carbon:machine-learning-model:',
    inputs_from: [
      { handle: handle('messages'), value: null },
      { handle: handle('input'), value: 'Alex' },
      { handle: handle('template'), value: [{ role: 'user', content: "Hello, I'm {{input}}" }] },
      { handle: handle('model'), value: { model: 'deepseek-v4-flash' } },
    ],
    task: {
      executor: { name: 'llm', options: { mode } },
      inputs_def: [
        {
          handle: handle('messages'),
          description: 'Optional messages accumulated from previous turns.',
          json_schema: messageSchema(),
          nullable: true,
        },
        { handle: handle('input'), description: 'Template input.', json_schema: { type: 'string' } },
        {
          handle: handle('template'),
          description: 'Messages for this turn. Template input handles are available as {{handle}} parameters.',
          json_schema: { ...messageWidgetSchema('Prompt'), minItems: 1 },
        },
        {
          handle: handle('model'),
          description: 'Model and generation parameters.',
          json_schema: modelSchema,
        },
      ],
      outputs_def: [output],
    },
  }
}
