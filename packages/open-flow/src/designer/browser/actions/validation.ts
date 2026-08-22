import type { I18n } from 'val-i18n'
import type { BlockName } from '../../../manifest/common/manifestTypes.ts'
import type { NodeId } from '../../../schema/index.ts'
import type { PackageAuthoring } from '../../common/packageAuthoring.ts'
import type { NodeStore } from '../stores/node/node.store.ts'

const VALID_NAME_MATCHER = /^[a-zA-Z0-9_-]*$/

function isBannedName(name: string): boolean {
  return name === '__proto__'
}

export function validateSharedBlockName(packageAuthoring: PackageAuthoring, i18n: I18n, newName: string, oldName?: string): string | undefined {
  if (!newName || newName === oldName) return
  if (!VALID_NAME_MATCHER.test(newName)) {
    return i18n.t('validation.sharedBlockNameInvalid')
  }
  if (isBannedName(newName)) {
    return i18n.t('validation.sharedBlockNameBanned', { name: newName })
  }
  if (
    packageAuthoring.packageMeta.sharedBlocks.taskBlocksByName.has(newName as BlockName) ||
    packageAuthoring.packageMeta.sharedBlocks.subflowBlocksByName.has(newName as BlockName)
  ) {
    return i18n.t('validation.sharedBlockNameExists')
  }
}

export function validateNodeId(nodes: ReadonlyMap<NodeId, NodeStore>, i18n: I18n, newName: NodeId, oldName: NodeId): string | undefined {
  if (!newName) return
  if (!VALID_NAME_MATCHER.test(newName)) {
    return i18n.t('validation.nodeIdInvalid')
  }
  if (isBannedName(newName)) {
    return i18n.t('validation.nodeIdBanned', { name: newName })
  }
  if (newName !== oldName && nodes.has(newName)) {
    return i18n.t('validation.nodeIdExists')
  }
}
