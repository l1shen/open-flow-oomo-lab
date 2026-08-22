import type { GroupDividerDef, HandleName, InputHandleDef, OutputHandleDef } from '../../../../schema/index.ts'

import { describe, expect, it } from 'vitest'
import { NODE_TYPE } from './constants.ts'
import { resolveOverviewNodeText, resolveOverviewPortCapability } from './overviewNode.ts'

const input: InputHandleDef = { handle: 'input' as HandleName }
const output: OutputHandleDef = { handle: 'output' as HandleName }
const group: GroupDividerDef = { group: 'Group' }

describe('resolveOverviewNodeText', () => {
  const titles = { inputTitle: 'Inputs', outputTitle: 'Outputs' }

  it('falls back to the node ID without repeating it as a summary', () => {
    expect(resolveOverviewNodeText({ ...titles, nodeType: NODE_TYPE.TaskNode, nodeId: 'prepare' })).toEqual({
      title: 'prepare',
      summary: undefined,
    })
  })

  it('keeps the node ID under a custom title unless a description is available', () => {
    expect(resolveOverviewNodeText({ ...titles, nodeType: NODE_TYPE.TaskNode, nodeId: 'prepare', title: 'Prepare data' })).toEqual({
      title: 'Prepare data',
      summary: 'prepare',
    })
    expect(
      resolveOverviewNodeText({
        ...titles,
        nodeType: NODE_TYPE.TaskNode,
        nodeId: 'prepare',
        title: 'Prepare data',
        description: 'Normalizes the source records.',
      }),
    ).toEqual({
      title: 'Prepare data',
      summary: 'Normalizes the source records.',
    })
  })

  it('prioritizes the error message as the error-node summary', () => {
    expect(
      resolveOverviewNodeText({
        ...titles,
        nodeType: NODE_TYPE.ErrorNode,
        nodeId: 'missing',
        description: 'Unavailable task',
        errorMessage: 'Block not found',
      }),
    ).toEqual({
      title: 'missing',
      summary: 'Block not found',
    })
  })

  it('uses localized virtual-node titles', () => {
    expect(resolveOverviewNodeText({ ...titles, nodeType: NODE_TYPE.InputNode, nodeId: 'input' })).toEqual({
      title: 'Inputs',
      summary: undefined,
    })
    expect(resolveOverviewNodeText({ ...titles, nodeType: NODE_TYPE.OutputNode, nodeId: 'output' })).toEqual({
      title: 'Outputs',
      summary: undefined,
    })
  })
})

describe('resolveOverviewPortCapability', () => {
  it.each([NODE_TYPE.TaskNode, NODE_TYPE.SubflowNode, NODE_TYPE.ConditionNode])('uses both declared port directions for %s', (nodeType) => {
    expect(resolveOverviewPortCapability({ nodeType, inputDefinitions: [group, input], outputDefinitions: [group, output] })).toEqual({
      hasInput: true,
      hasOutput: true,
    })
    expect(resolveOverviewPortCapability({ nodeType, inputDefinitions: [group], outputDefinitions: [group] })).toEqual({
      hasInput: false,
      hasOutput: false,
    })
  })

  it.each([NODE_TYPE.TriggerNode, NODE_TYPE.ValueNode])('treats %s definitions as outputs only', (nodeType) => {
    expect(resolveOverviewPortCapability({ nodeType, inputDefinitions: [input], outputDefinitions: [output] })).toEqual({
      hasInput: false,
      hasOutput: true,
    })
  })

  it('uses only the outward direction for virtual input and output nodes', () => {
    expect(resolveOverviewPortCapability({ nodeType: NODE_TYPE.InputNode, inputDefinitions: [input], outputDefinitions: [output] })).toEqual({
      hasInput: false,
      hasOutput: true,
    })
    expect(resolveOverviewPortCapability({ nodeType: NODE_TYPE.OutputNode, inputDefinitions: [input], outputDefinitions: [output] })).toEqual({
      hasInput: true,
      hasOutput: false,
    })
  })

  it('infers error-node outputs without trusting empty display definitions', () => {
    expect(
      resolveOverviewPortCapability({
        nodeType: NODE_TYPE.ErrorNode,
        outputDefinitions: [],
        errorOutputHandles: ['result' as HandleName],
      }),
    ).toEqual({
      hasInput: false,
      hasOutput: true,
    })
  })

  it('does not expose ports for comments', () => {
    expect(resolveOverviewPortCapability({ nodeType: NODE_TYPE.CommentNode, inputDefinitions: [input], outputDefinitions: [output] })).toEqual({
      hasInput: false,
      hasOutput: false,
    })
  })
})
