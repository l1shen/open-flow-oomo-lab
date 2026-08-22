import type { ReadonlyVal } from 'value-enhancer'
import type { SubflowBlockMeta } from '../block/subflowBlockMeta.ts'
import type { TaskBlockMeta } from '../block/taskBlockMeta.ts'
import type { FlowMeta } from '../flowMeta.ts'
import type { NodeMeta } from '../nodeMeta.ts'
import type { PackageMeta } from './packageMeta.ts'

import { inertFilter } from '@wopjs/cast'
import { isInlineTaskBlockManifest } from '../../model/block/inlineTaskBlockManifest.ts'
import { isConditionNodeManifest } from '../../model/node/conditionNodeManifest.ts'
import { isTaskNodeManifest } from '../../model/node/taskNodeManifest.ts'
import { isValueNodeManifest } from '../../model/node/valueNodeManifest.ts'
import { isUserTranslateKey } from './userLocales.ts'

let toRemovedKeys = /* @__PURE__ */ new Set<string>()

interface CommentTranslationFields {
  readonly $$: {
    readonly title: ReadonlyVal<string | undefined>
    readonly content: ReadonlyVal<string | undefined>
  }
}

export function onTranslationKeyChanged(packageMeta: PackageMeta, { newKey, oldKey }: { newKey: string | null; oldKey: string }): void {
  if (newKey === oldKey) return

  toRemovedKeys.add(`%${oldKey}%`)
  debouncedCleanTranslationKeys(packageMeta)
}

export function cleanRemovedCommentNodeTranslationKeys(packageMeta: PackageMeta, commentNodeStore: CommentTranslationFields): void {
  checkStr$(commentNodeStore.$$.title, true)
  checkStr$(commentNodeStore.$$.content, true)
  debouncedCleanTranslationKeys(packageMeta)
}

export function cleanRemovedTaskBlockTranslationKeys(taskBlockMeta: TaskBlockMeta): void {
  checkTaskBlockMeta(taskBlockMeta, true)
  debouncedCleanTranslationKeys(taskBlockMeta.packageMeta)
}

export function cleanRemovedSubflowBlockTranslationKeys(subflowBlockMeta: SubflowBlockMeta): void {
  checkSubflowBlockMeta(subflowBlockMeta, true)
  debouncedCleanTranslationKeys(subflowBlockMeta.packageMeta)
}

export function cleanRemovedFlowTranslationKeys(flowMeta: FlowMeta): void {
  checkFlowMeta(flowMeta, true)
  debouncedCleanTranslationKeys(flowMeta.packageMeta)
}

export function cleanRemovedNodesTranslationKeys(packageMeta: PackageMeta, nodeMetas: Iterable<NodeMeta>): void {
  checkNodes(nodeMetas, true)
  debouncedCleanTranslationKeys(packageMeta)
}

let debounceTimer: ReturnType<typeof setTimeout> | undefined
function debouncedCleanTranslationKeys(packageMeta: PackageMeta): void {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(cleanTranslationKeys, 200, packageMeta)
}

function cleanTranslationKeys(packageMeta: PackageMeta): void {
  if (toRemovedKeys.size === 0) return
  if (!checkPackage(packageMeta, false)) {
    for (const locale$ of Object.values(packageMeta.l10n.designerLocales)) {
      const locale = locale$?.value
      if (locale) {
        const entries = Object.entries(locale)
        const filtered = inertFilter(entries, ([k]) => !toRemovedKeys.has(`%${k}%`))
        if (filtered.length !== entries.length) {
          locale$.set(Object.fromEntries(filtered))
        }
      }
    }
  }
  toRemovedKeys.clear()
}

function checkStr(str: string | undefined, collectMode: boolean): boolean {
  if (collectMode) {
    if (isUserTranslateKey(str)) {
      toRemovedKeys.add(str)
    }
  } else {
    if (str && toRemovedKeys.has(str)) {
      toRemovedKeys.delete(str)
    }
  }
  return toRemovedKeys.size <= 0
}

function checkStr$(str$: ReadonlyVal<string | undefined>, collectMode: boolean): boolean {
  return checkStr(str$.value, collectMode)
}

function checkHandleDefs$(defs: ReadonlyVal<ReadonlyArray<{ description?: string } | {}> | undefined>, collectMode: boolean): boolean {
  if (defs.value) {
    for (const def of defs.value) {
      if (checkStr((def as { description?: string } | undefined)?.description, collectMode)) {
        return true
      }
    }
  }
  return false
}

function checkNode(nodeMeta: NodeMeta, collectMode: boolean): boolean {
  const nodeManifest = nodeMeta.manifest
  if (checkStr$(nodeManifest.$.title, collectMode) || checkStr$(nodeManifest.$.description, collectMode)) {
    return true
  }

  if (isTaskNodeManifest(nodeManifest)) {
    if (checkHandleDefs$(nodeManifest.$.inputs_def, collectMode) || checkHandleDefs$(nodeManifest.$.outputs_def, collectMode)) {
      return true
    }

    const blockManifest = nodeManifest.$.task.value
    if (isInlineTaskBlockManifest(blockManifest)) {
      if (checkHandleDefs$(blockManifest.$.inputs_def, collectMode) || checkHandleDefs$(blockManifest.$.outputs_def, collectMode)) {
        return true
      }
    }
  } else if (isValueNodeManifest(nodeManifest)) {
    const valueBlockManifest = nodeManifest.$.values.value
    if (valueBlockManifest && checkHandleDefs$(valueBlockManifest.$.values, collectMode)) {
      return true
    }
  } else if (isConditionNodeManifest(nodeManifest)) {
    if (checkHandleDefs$(nodeManifest.$.inputs_def, collectMode)) {
      return true
    }
    const conditionBlockManifest = nodeManifest.$.conditions.value
    if (conditionBlockManifest) {
      if (checkHandleDefs$(conditionBlockManifest.$.cases, collectMode) || checkStr(conditionBlockManifest.$.default.value?.description, collectMode)) {
        return true
      }
    }
  }
  return false
}

function checkNodes(nodes: Iterable<NodeMeta>, collectMode: boolean): boolean {
  for (const nodeMeta of nodes) {
    if (checkNode(nodeMeta, collectMode)) {
      return true
    }
  }
  return false
}

function checkFlowMeta(flowMeta: FlowMeta, collectMode: boolean): boolean {
  const flowManifest = flowMeta.manifest
  return checkStr$(flowManifest.$.title, collectMode) || checkStr$(flowManifest.$.description, collectMode) || checkNodes(flowMeta.nodes.values(), collectMode)
}

function checkTaskBlockMeta(taskBlockMeta: TaskBlockMeta, collectMode: boolean): boolean {
  const blockManifest = taskBlockMeta.manifest
  return (
    checkStr$(blockManifest.$.title, collectMode) ||
    checkStr$(blockManifest.$.description, collectMode) ||
    checkHandleDefs$(blockManifest.$.inputs_def, collectMode) ||
    checkHandleDefs$(blockManifest.$.outputs_def, collectMode)
  )
}

function checkSubflowBlockMeta(subflowBlockMeta: SubflowBlockMeta, collectMode: boolean): boolean {
  const subflowBlockManifest = subflowBlockMeta.manifest
  return (
    checkStr$(subflowBlockManifest.$.title, collectMode) ||
    checkStr$(subflowBlockManifest.$.description, collectMode) ||
    checkHandleDefs$(subflowBlockManifest.$.inputs_def, collectMode) ||
    checkHandleDefs$(subflowBlockManifest.$.outputs_def, collectMode) ||
    checkNodes(subflowBlockMeta.nodes.values(), collectMode)
  )
}

function checkPackage(packageMeta: PackageMeta, collectMode: boolean): boolean {
  if (checkStr$(packageMeta.manifest.$.displayName, collectMode) || checkStr$(packageMeta.manifest.$.description, collectMode)) {
    return true
  }

  for (const flowMeta of packageMeta.flows.flowsByName.values()) {
    if (checkFlowMeta(flowMeta, collectMode)) {
      return true
    }
  }

  for (const taskBlockMeta of packageMeta.sharedBlocks.taskBlocksByName.values()) {
    if (checkTaskBlockMeta(taskBlockMeta, collectMode)) {
      return true
    }
  }

  for (const subflowBlockMeta of packageMeta.sharedBlocks.subflowBlocksByName.values()) {
    if (checkSubflowBlockMeta(subflowBlockMeta, collectMode)) {
      return true
    }
  }

  return false
}
