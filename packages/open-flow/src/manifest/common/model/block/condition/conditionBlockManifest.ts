import type { ReadonlyVal } from 'value-enhancer'
import type { ConditionHandleDef, DefaultConditionHandleDef, InlineConditionBlock } from '../../../../../schema/index.ts'
import type { BlockManifest } from '../base/blockManifest.ts'

import { ConditionBlockManifestKind } from '../internal.ts'

/** `conditions` */
export interface ConditionBlockManifest$ {
  readonly cases: ReadonlyVal<ConditionHandleDef[] | undefined>
  readonly default: ReadonlyVal<DefaultConditionHandleDef | undefined>
}

export interface ConditionBlockManifest extends BlockManifest {
  readonly KIND: Record<ConditionBlockManifestKind, boolean> & BlockManifest['KIND']

  readonly $: ConditionBlockManifest$

  toJSON(): InlineConditionBlock
}

export const isConditionBlockManifest = (block: any): block is ConditionBlockManifest => block?.KIND?.[ConditionBlockManifestKind] === true

export const toConditionBlockManifest = (block: any): ConditionBlockManifest | undefined => {
  if (isConditionBlockManifest(block)) {
    return block
  }
}
