import type { ReadonlyVal } from 'value-enhancer'
import type { InputHandleDef, NodeId, OutputHandleDef } from '../../../../schema/index.ts'
import type { BlockResourceName } from '../../manifestTypes.ts'
import type { InlineTaskBlockManifest } from '../block/inlineTaskBlockManifest.ts'
import type { NodeManifestKind } from './internal.ts'
import type { NodeManifest, ScheduledNodeManifest$ } from './nodeManifest.ts'

import { TaskNodeManifestKind } from './internal.ts'

export interface TaskNodeManifest$ extends ScheduledNodeManifest$ {
  readonly task: ReadonlyVal<BlockResourceName | InlineTaskBlockManifest | undefined>
  readonly inputs_def: ReadonlyVal<InputHandleDef[] | undefined>
  readonly outputs_def: ReadonlyVal<OutputHandleDef[] | undefined>
}

export interface TaskNodeManifest extends NodeManifest {
  readonly KIND: Record<TaskNodeManifestKind | NodeManifestKind, boolean>

  readonly nodeType: 'task'

  readonly $: TaskNodeManifest$

  clone(nodeId: NodeId): TaskNodeManifest
}

export const isTaskNodeManifest = (node: any): node is TaskNodeManifest => node?.KIND?.[TaskNodeManifestKind] === true

export const toTaskNodeManifest = (node: unknown): TaskNodeManifest | undefined => {
  if (isTaskNodeManifest(node)) {
    return node
  }
}
