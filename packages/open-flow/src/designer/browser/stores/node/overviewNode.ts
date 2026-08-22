import type { GroupDividerDef, HandleName, InputHandleDef, OutputHandleDef } from '../../../../schema/index.ts'
import type { NodeType } from './constants.ts'

import { NODE_TYPE } from './constants.ts'

export interface OverviewPortCapability {
  readonly hasInput: boolean
  readonly hasOutput: boolean
}

export interface OverviewPortDefinitions {
  readonly nodeType: NodeType
  readonly inputDefinitions?: readonly (InputHandleDef | GroupDividerDef)[]
  readonly outputDefinitions?: readonly (OutputHandleDef | GroupDividerDef)[]
  readonly errorOutputHandles?: readonly HandleName[]
}

export interface OverviewNodeTextSource {
  readonly nodeType: NodeType
  readonly nodeId: string
  readonly title?: string
  readonly description?: string
  readonly errorMessage?: string
  readonly inputTitle: string
  readonly outputTitle: string
}

export interface OverviewNodeText {
  readonly title: string
  readonly summary?: string
}

export function resolveOverviewNodeText(source: OverviewNodeTextSource): OverviewNodeText {
  let title: string
  if (source.nodeType == NODE_TYPE.InputNode) {
    title = source.inputTitle
  } else if (source.nodeType == NODE_TYPE.OutputNode) {
    title = source.outputTitle
  } else {
    title = source.title || source.nodeId
  }

  let summary: string | undefined
  if (source.nodeType == NODE_TYPE.ErrorNode && source.errorMessage) {
    summary = source.errorMessage
  } else if (source.description) {
    summary = source.description
  } else if (source.title && title != source.nodeId && source.nodeType != NODE_TYPE.InputNode && source.nodeType != NODE_TYPE.OutputNode) {
    summary = source.nodeId
  }

  return { title, summary }
}

export function resolveOverviewPortCapability(definitions: OverviewPortDefinitions): OverviewPortCapability {
  const hasDeclaredInput = definitions.inputDefinitions?.some(hasHandle) ?? false
  const hasDeclaredOutput = definitions.outputDefinitions?.some(hasHandle) ?? false

  switch (definitions.nodeType) {
    case NODE_TYPE.TaskNode:
    case NODE_TYPE.SubflowNode:
    case NODE_TYPE.ConditionNode:
      return { hasInput: hasDeclaredInput, hasOutput: hasDeclaredOutput }
    case NODE_TYPE.TriggerNode:
    case NODE_TYPE.ValueNode:
    case NODE_TYPE.InputNode:
      return { hasInput: false, hasOutput: hasDeclaredOutput }
    case NODE_TYPE.OutputNode:
      return { hasInput: hasDeclaredInput, hasOutput: false }
    case NODE_TYPE.ErrorNode:
      return { hasInput: false, hasOutput: (definitions.errorOutputHandles?.length ?? 0) > 0 }
    case NODE_TYPE.CommentNode:
      return { hasInput: false, hasOutput: false }
    default:
      return { hasInput: false, hasOutput: false }
  }
}

function hasHandle(definition: InputHandleDef | OutputHandleDef | GroupDividerDef): boolean {
  return 'handle' in definition
}
