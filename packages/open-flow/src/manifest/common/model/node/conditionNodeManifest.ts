import type { ReadonlyVal } from 'value-enhancer'
import type { InputHandleDef } from '../../../../schema/index.ts'
import type { ConditionBlockManifest } from '../block/condition/conditionBlockManifest.ts'
import type { NodeManifestKind } from './internal.ts'
import type { NodeManifest, ProgressNodeManifest$ } from './nodeManifest.ts'

import { ConditionNodeManifestKind } from './internal.ts'

export interface ConditionNodeManifest$ extends ProgressNodeManifest$ {
  readonly inputs_def: ReadonlyVal<InputHandleDef[] | undefined>
  readonly conditions: ReadonlyVal<ConditionBlockManifest | undefined>
}

export interface ConditionNodeManifest extends NodeManifest {
  readonly KIND: Record<ConditionNodeManifestKind | NodeManifestKind, boolean>

  readonly nodeType: 'condition'

  readonly $: ConditionNodeManifest$

  clone(nodeId: string): ConditionNodeManifest
}

export const isConditionNodeManifest = (node: any): node is ConditionNodeManifest => node?.KIND?.[ConditionNodeManifestKind] === true

export const toConditionNodeManifest = (node: unknown): ConditionNodeManifest | undefined => {
  if (isConditionNodeManifest(node)) {
    return node
  }
}
