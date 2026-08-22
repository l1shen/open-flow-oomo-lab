import type { GroupDividerDef, InputHandleDef, OutputHandleDef, HandleInputFrom, NodeId, HandleName } from '../../../../schema/index.ts'
import type { MapUndefined } from '../../base/typing.ts'

export type { GroupDividerDef, InputHandleDef, OutputHandleDef, HandleInputFrom }

/** Allows `def.handle == null` to narrow a grouped input definition. */
export type GroupedInputHandleDef = (GroupDividerDef & MapUndefined<InputHandleDef>) | InputHandleDef

/** Allows `def.handle == null` to narrow a grouped output definition. */
export type GroupedOutputHandleDef = (GroupDividerDef & MapUndefined<OutputHandleDef>) | OutputHandleDef

/** A compact grouped-handle index used to avoid redundant listeners. */
export type HandleIndex = { readonly handle: HandleName } | { readonly group: string; readonly handle?: undefined }

export function matchesIndex(def: GroupedInputHandleDef, index: HandleIndex): boolean {
  if (def.handle == null) {
    return index.handle == null && def.group === index.group
  } else {
    return def.handle === index.handle
  }
}

export function isHandleDef(def: GroupedInputHandleDef): def is InputHandleDef
export function isHandleDef(def: GroupedOutputHandleDef): def is OutputHandleDef
export function isHandleDef(def: GroupedInputHandleDef | GroupedOutputHandleDef): boolean {
  return def.handle != null
}

export function isGroupDef(def: GroupedInputHandleDef): def is GroupDividerDef
export function isGroupDef(def: GroupedOutputHandleDef): def is GroupDividerDef
export function isGroupDef(def: GroupedInputHandleDef | GroupedOutputHandleDef): boolean {
  return def.handle == null
}

export type NodeType = `${NODE_TYPE}`
export enum NODE_TYPE {
  ErrorNode = 'error_node',
  InputNode = 'input_node',
  OutputNode = 'output_node',
  TaskNode = 'task_node',
  SubflowNode = 'subflow_node',
  ValueNode = 'value_node',
  ConditionNode = 'condition_node',
  CommentNode = 'comment_node',
  TriggerNode = 'trigger_node',
}

/** Returns whether a node has a persisted node_id rather than a pseudo-node ID. */
export const isManifestNodeType = (type: NodeType): boolean =>
  type == NODE_TYPE.TaskNode ||
  type == NODE_TYPE.ValueNode ||
  type == NODE_TYPE.SubflowNode ||
  type == NODE_TYPE.ConditionNode ||
  type == NODE_TYPE.TriggerNode ||
  type == NODE_TYPE.ErrorNode

export const isPseudoNodeType = (type: NodeType): boolean => type == NODE_TYPE.InputNode || type == NODE_TYPE.OutputNode

export type NodeStatus = `${NODE_STATUS}`
export enum NODE_STATUS {
  Idle = 'idle',
  Waiting = 'waiting',
  Running = 'running',
  Success = 'success',
  Error = 'error',
}

export type WidgetActionType = 'download' | 'openInNewTab' | 'reload'
export interface WidgetAction {
  title?: string
  type: WidgetActionType
  onClick: (ev: React.MouseEvent<HTMLButtonElement>) => void
}

export type ErrorMessage = string

export const MIN_NODE_WIDTH = 350
export const DEFAULT_NODE_WIDTH = 420
export const FITTING_VIEW_CLASSNAME = 'oo-designer-fitting-view'

export const INPUT_NODE_ID = 'input' as NodeId
export const OUTPUT_NODE_ID = 'output' as NodeId
