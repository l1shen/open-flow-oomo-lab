import type { ReadonlyVal } from 'value-enhancer'
import type { FileManifest, PackageName } from '../../manifestTypes.ts'

import { PackageManifestKind } from './internal.ts'

export interface PackageManifest$ {
  readonly name: ReadonlyVal<PackageName | undefined>
  readonly displayName: ReadonlyVal<string | undefined>
  readonly icon: ReadonlyVal<string | undefined>
  readonly description: ReadonlyVal<string | undefined>
}

export interface PackageManifest extends FileManifest {
  readonly KIND: Record<PackageManifestKind, boolean>

  readonly $: PackageManifest$
}

export const isPackageManifest = (manifest: any): manifest is PackageManifest => manifest?.KIND?.[PackageManifestKind] === true

export const toPackageManifest = (manifest: unknown): PackageManifest | undefined => {
  if (isPackageManifest(manifest)) {
    return manifest
  }
}
