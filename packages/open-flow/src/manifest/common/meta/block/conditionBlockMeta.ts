import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal } from 'value-enhancer'
import type {
  ConditionExpression,
  ConditionHandleDef,
  DefaultConditionHandleDef,
  HandleName,
  InputHandleDef,
  OutputHandleDef,
} from '../../../../schema/index.ts'
import type { WritableConditionBlockManifest } from '../../writable/block/writableConditionBlockManifest.ts'
import type { PackageMeta } from '../package/packageMeta.ts'
import type { BlockMeta } from './blockMeta.ts'

import { disposableStore } from '@wopjs/disposable'
import { isEqual } from 'radash'
import { arrayShallowEqual, combine, derive } from 'value-enhancer'
import { getHandleNames } from '../../model/block/base/blockManifest.ts'
import { BlockMetaKind } from './internal.ts'

const ConditionBlockMetaKind: unique symbol = Symbol('ConditionBlockMeta')
type ConditionBlockMetaKind = typeof ConditionBlockMetaKind

export interface ConditionBlockMeta$ {
  readonly displayConditionHandleDefs: ReadonlyVal<ConditionHandleDef[] | undefined>
  readonly displayDefaultConditionHandleDef: ReadonlyVal<DefaultConditionHandleDef | undefined>
  readonly inputHandleDefs: ReadonlyVal<InputHandleDef[] | undefined>
  // Condition cases define the projected output handles.
  readonly outputHandleDefs: ReadonlyVal<OutputHandleDef[] | undefined>
  readonly inputHandleNames: ReadonlyVal<HandleName[]>
  readonly outputHandleNames: ReadonlyVal<HandleName[]>
}

export interface ConditionBlockMetaProps {
  readonly manifest: WritableConditionBlockManifest
  readonly packageMeta: PackageMeta
  readonly inputHandleDefs$: ReadonlyVal<InputHandleDef[] | undefined>
}

export const CONDITION_BLOCK_ICON = ':carbon:child-node:'

export class ConditionBlockMeta implements BlockMeta {
  public readonly KIND: Record<BlockMetaKind | ConditionBlockMetaKind, boolean> = {
    [BlockMetaKind]: true,
    [ConditionBlockMetaKind]: true,
  }

  public readonly dispose: DisposableStore = disposableStore()

  public readonly manifest: WritableConditionBlockManifest

  public readonly $: ConditionBlockMeta$

  public readonly packageMeta: PackageMeta

  public static is(blockMeta: any): blockMeta is ConditionBlockMeta {
    return blockMeta?.KIND?.[ConditionBlockMetaKind] === true
  }

  public static to(blockMeta: unknown): ConditionBlockMeta | undefined {
    if (ConditionBlockMeta.is(blockMeta)) {
      return blockMeta
    }
  }

  public constructor({ manifest, packageMeta, inputHandleDefs$ }: ConditionBlockMetaProps) {
    this.manifest = this.dispose.add(manifest)
    this.packageMeta = packageMeta

    const outputHandleDefs = combine([manifest.$.cases, manifest.$.default, inputHandleDefs$], conditionsToOutputDefs, {
      equal: isEqual,
    })
    this.$ = {
      displayConditionHandleDefs: packageMeta.l10n.displayHandleDefs$(manifest.$.cases),
      displayDefaultConditionHandleDef: packageMeta.l10n.displayHandleDef$(manifest.$.default),
      inputHandleDefs: inputHandleDefs$.ref(),
      outputHandleDefs,
      inputHandleNames: derive(inputHandleDefs$, getHandleNames, { equal: arrayShallowEqual }),
      outputHandleNames: derive(outputHandleDefs, getHandleNames, { equal: arrayShallowEqual }),
    }

    this.dispose.add(Object.values(this.$))
  }

  public toJSON(): object {
    return this.manifest.toJSON()
  }
}

/** Condition outputs inherit the first input schema. */
function conditionsToOutputDefs([cases, defaultCase, inputDefs]: [
  ConditionHandleDef[] | undefined,
  DefaultConditionHandleDef | undefined,
  InputHandleDef[] | undefined,
]): OutputHandleDef[] | undefined {
  const firstInputDef = inputDefs?.[0]
  let outputDefs: OutputHandleDef[] | undefined
  if (cases?.length) {
    for (const item of cases) {
      if (!outputDefs) outputDefs = []
      const { json_schema, nullable } = typeNarrowing(item, firstInputDef)
      outputDefs.push({
        handle: item.handle,
        description: item.description,
        json_schema: json_schema,
        kind: firstInputDef?.kind,
        nullable: nullable,
      })
    }
  }
  if (defaultCase) {
    if (!outputDefs) outputDefs = []
    outputDefs.push({
      handle: defaultCase.handle,
      description: defaultCase.description,
      json_schema: firstInputDef?.json_schema,
      kind: firstInputDef?.kind,
      nullable: firstInputDef?.nullable,
    })
  }
  return outputDefs
}

interface NarrowedType {
  readonly json_schema: unknown
  readonly nullable: boolean | undefined
}

// This projection intentionally leaves schema errors to canonical validation.
function typeNarrowing(item: ConditionHandleDef, firstHandleDef: InputHandleDef | undefined): NarrowedType {
  if (!item.expressions?.length || !firstHandleDef) {
    return { json_schema: {}, nullable: undefined }
  }

  const { logical, expressions } = item
  const handle = firstHandleDef.handle
  let json_schema = firstHandleDef.json_schema
  let nullable = firstHandleDef.nullable

  if (nullable) {
    if (logical === 'AND') {
      if (expressions.some((expr) => expr.input_handle === handle && assertsNotNull(expr.operator, expr.value))) {
        nullable = false
      } else if (expressions.some((expr) => expr.input_handle === handle && assertsNull(expr.operator, expr.value))) {
        json_schema = { type: 'null' }
        nullable = false
      }
    } else {
      if (expressions.every((expr) => expr.input_handle === handle && assertsNotNull(expr.operator, expr.value))) {
        nullable = false
      } else if (expressions.every((expr) => expr.input_handle === handle && assertsNull(expr.operator, expr.value))) {
        json_schema = { type: 'null' }
        nullable = false
      }
    }
  }

  return { json_schema, nullable }
}

function assertsNull(operator: ConditionExpression['operator'], value: unknown): boolean {
  switch (operator) {
    case '==':
      return value === null
    case 'is null':
      return true
    default:
      return false
  }
}

function assertsNotNull(operator: ConditionExpression['operator'], value: unknown): boolean {
  switch (operator) {
    case '==':
      return value !== null
    case '!=':
      return value === null
    case '<':
    case '<=':
    case '>':
    case '>=':
    case 'is not null':
    case 'is true':
    case 'is false':
    case 'is not empty':
    case 'contains':
    case 'has key':
    case 'has value':
    case 'starts with':
    case 'ends with':
      return true
    default:
      return false
  }
}
