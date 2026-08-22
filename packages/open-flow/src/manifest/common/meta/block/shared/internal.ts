import type { ResourceUriResolver } from '../../../../../base/common/resource.ts'
import type { BlockPath, SearchPath } from '../../../manifestTypes.ts'
import type { SharedBlockManifest } from '../../../model/block/sharedBlockManifest.ts'
import type { PackageMeta } from '../../package/packageMeta.ts'
import type { SharedBlockMeta$ } from './sharedBlockMeta.ts'

import { arrayShallowEqual, compute, derive } from 'value-enhancer'
import { filterInputHandleOnlyDefs, filterOutputHandleOnlyDefs, getHandleNames } from '../../../model/block/base/blockManifest.ts'

export const createSharedBlockMeta$ = (
  manifest: SharedBlockManifest,
  resolveResourceUri: ResourceUriResolver,
  packageMeta: PackageMeta,
  blockPath: BlockPath,
  searchPath: SearchPath,
): SharedBlockMeta$ => {
  const title = packageMeta.l10n.display$(manifest.$.title)
  const description = packageMeta.l10n.display$(manifest.$.description)
  const detail = packageMeta.l10n.detail$(manifest.$.title, manifest.$.description)
  const icon = compute((get) => {
    const blockIcon = get(manifest.$.icon)
    if (blockIcon) {
      return resolveResourceUri(blockIcon, blockPath, searchPath)
    }
    return get(packageMeta.$.icon)
  })
  const inputHandleDefs = derive(manifest.$.inputs_def, filterInputHandleOnlyDefs, { equal: arrayShallowEqual })
  const outputHandleDefs = derive(manifest.$.outputs_def, filterOutputHandleOnlyDefs, { equal: arrayShallowEqual })
  const displayInputHandleDefs = packageMeta.l10n.displayHandleDefs$(manifest.$.inputs_def)
  const displayOutputHandleDefs = packageMeta.l10n.displayHandleDefs$(manifest.$.outputs_def)
  const inputHandleNames = derive(inputHandleDefs, getHandleNames, { equal: arrayShallowEqual })
  const outputHandleNames = derive(outputHandleDefs, getHandleNames, { equal: arrayShallowEqual })
  const private$ = manifest.$.private.ref()

  return {
    title,
    detail,
    description,
    icon,
    inputHandleDefs,
    outputHandleDefs,
    inputHandleNames,
    outputHandleNames,
    displayInputHandleDefs,
    displayOutputHandleDefs,
    private: private$,
  }
}
