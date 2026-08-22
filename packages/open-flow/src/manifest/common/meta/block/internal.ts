import type { InlineBlockManifest } from '../../model/block/inlineBlockManifest.ts'
import type { UserLocales } from '../package/userLocales.ts'
import type { InlineBlockMeta$ } from './inlineBlockMeta.ts'

import { arrayShallowEqual, derive } from 'value-enhancer'
import { filterInputHandleOnlyDefs, filterOutputHandleOnlyDefs, getHandleNames } from '../../model/block/base/blockManifest.ts'

export const BlockMetaKind: unique symbol = Symbol('BlockMeta')
export type BlockMetaKind = typeof BlockMetaKind

export const SharedBlockMetaKind: unique symbol = Symbol('SharedBlockMeta')
export type SharedBlockMetaKind = typeof SharedBlockMetaKind

export const InlineBlockMetaKind: unique symbol = Symbol('InlineBlockMeta')
export type InlineBlockMetaKind = typeof InlineBlockMetaKind

export const ErrorBlockMetaKind: unique symbol = Symbol('ErrorBlockMeta')
export type ErrorBlockMetaKind = typeof ErrorBlockMetaKind

export const createInlineBlockMeta$ = (manifest: InlineBlockManifest, l10n: UserLocales): InlineBlockMeta$ => {
  const inputHandleDefs = derive(manifest.$.inputs_def, filterInputHandleOnlyDefs, { equal: arrayShallowEqual })
  const outputHandleDefs = derive(manifest.$.outputs_def, filterOutputHandleOnlyDefs, { equal: arrayShallowEqual })
  return {
    inputHandleDefs,
    outputHandleDefs,
    displayInputHandleDefs: l10n.displayHandleDefs$(manifest.$.inputs_def),
    displayOutputHandleDefs: l10n.displayHandleDefs$(manifest.$.outputs_def),
    inputHandleNames: derive(inputHandleDefs, getHandleNames, {
      equal: arrayShallowEqual,
    }),
    outputHandleNames: derive(outputHandleDefs, getHandleNames, {
      equal: arrayShallowEqual,
    }),
  }
}
