import type { DisposableStore } from '@wopjs/disposable'
import type { GroupDividerDef, HandleName, InputHandleDef, OutputHandleDef } from '../../../../../schema/index.ts'

import { inertFilter, isString } from '@wopjs/cast'
import { isUnknownRecord } from '../../../../../base/common/type.ts'
import { BlockManifestKind } from '../internal.ts'

export interface BlockManifest {
  readonly dispose: DisposableStore

  readonly KIND: Record<BlockManifestKind, boolean>

  toJSON(): object
}

export const isBlockManifest = (manifest: any): manifest is BlockManifest => manifest?.KIND?.[BlockManifestKind] === true

export const toBlockManifest = (manifest: any): BlockManifest | undefined => {
  if (isBlockManifest(manifest)) {
    return manifest
  }
}

export const isGroupDividerDef = (def: unknown): def is GroupDividerDef => isUnknownRecord(def) && isString(def.group)

export const isInputHandleDef = (def: InputHandleDef | GroupDividerDef): def is InputHandleDef => !isGroupDividerDef(def)

export const isOutputHandleDef = (def: OutputHandleDef | GroupDividerDef): def is OutputHandleDef => !isGroupDividerDef(def)

export const filterInputHandleOnlyDefs = (defs?: (InputHandleDef | GroupDividerDef)[]): InputHandleDef[] | undefined => inertFilter(defs, isInputHandleDef)

export const filterOutputHandleOnlyDefs = (defs?: (OutputHandleDef | GroupDividerDef)[]): OutputHandleDef[] | undefined => inertFilter(defs, isOutputHandleDef)

export const getHandleNames = (defs?: readonly { readonly handle: HandleName }[]): HandleName[] => defs?.map(getHandleName) || []

const getHandleName = (def: { readonly handle: HandleName }): HandleName => def.handle
