import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal } from 'value-enhancer'
import type { ValueHandleDef } from '../../../../schema/index.ts'
import type { WritableValueBlockManifest } from '../../writable/block/writableValueBlockManifest.ts'
import type { PackageMeta } from '../package/packageMeta.ts'
import type { BlockMeta } from './blockMeta.ts'

import { disposableStore } from '@wopjs/disposable'
import { BlockMetaKind } from './internal.ts'

const ValueBlockMetaKind: unique symbol = Symbol('ValueBlockMeta')
type ValueBlockMetaKind = typeof ValueBlockMetaKind

export interface ValueBlockMetaProps {
  manifest: WritableValueBlockManifest
  packageMeta: PackageMeta
}

export interface ValueBlockMeta$ {
  /** Translated */
  readonly displayValuesHandleDefs: ReadonlyVal<ValueHandleDef[] | undefined>
}

export const VALUE_BLOCK_ICON = ':oomol:value:'

export class ValueBlockMeta implements BlockMeta {
  public readonly KIND: Record<BlockMetaKind | ValueBlockMetaKind, boolean> = {
    [BlockMetaKind]: true,
    [ValueBlockMetaKind]: true,
  }

  public readonly dispose: DisposableStore = disposableStore()

  public readonly $: ValueBlockMeta$

  public readonly manifest: WritableValueBlockManifest

  public readonly packageMeta: PackageMeta

  public static is(blockMeta: any): blockMeta is ValueBlockMeta {
    return blockMeta?.KIND?.[ValueBlockMetaKind] === true
  }

  public static to(blockMeta: unknown): ValueBlockMeta | undefined {
    if (ValueBlockMeta.is(blockMeta)) {
      return blockMeta
    }
  }

  public constructor({ manifest, packageMeta }: ValueBlockMetaProps) {
    this.manifest = this.dispose.add(manifest)
    this.packageMeta = packageMeta
    this.$ = {
      displayValuesHandleDefs: this.dispose.add(packageMeta.l10n.displayHandleDefs$(this.manifest.$.values)),
    }
  }

  public toJSON(): object {
    return this.manifest.toJSON()
  }
}
