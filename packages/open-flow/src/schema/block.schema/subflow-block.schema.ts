import { z } from 'zod'
import { NodeSchema, HandleOutputFromSchema, NodeIdSchema } from '../node.schema.ts'
import { BlockBase } from './block-base.ts'

export const SubflowBlockSchema = /* @__PURE__ */ z
  .strictObject({
    ...BlockBase,
    private: z.boolean().optional().default(false).describe('Hide the subflow from the blocks list and exclude it from AI tools'),
    nodes: z.array(NodeSchema).optional().describe('Nodes in the Subflow'),
    outputs_from: z.array(HandleOutputFromSchema).optional().describe('Provides data sources for Subflow output handles.'),
    forward_previews: z.array(NodeIdSchema).optional().describe('List of nodes whose previews are forwarded to the Subflow node.'),
  })
  .describe('A Subflow Block defines a Subflow that acts as a Block externally and as a Flow internally.')
