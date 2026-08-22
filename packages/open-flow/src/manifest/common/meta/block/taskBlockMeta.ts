import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal } from 'value-enhancer'
import type { ResourceUriResolver } from '../../../../base/common/resource.ts'
import type { InputHandleDef } from '../../../../schema/index.ts'
import type { WSId, BlockResourceName, BlockName, BlockPath, SearchPath } from '../../manifestTypes.ts'
import type { WritableTaskBlockManifest } from '../../writable/block/writableTaskBlockManifest.ts'
import type { PackageMeta } from '../package/packageMeta.ts'
import type { TypingLanguage } from './generateTyping.ts'
import type { SharedBlockMeta, SharedBlockMeta$ } from './shared/sharedBlockMeta.ts'

import { isString } from '@wopjs/cast'
import { disposableStore } from '@wopjs/disposable'
import { compute, derive } from 'value-enhancer'
import { dirname, isAbsolute, join } from '../../../../base/common/posixPath.ts'
import { encodeBlockResourceName } from '../../blockResourceName.ts'
import { getManifestName } from '../../manifestName.ts'
import { generateTyping } from './generateTyping.ts'
import { BlockMetaKind, SharedBlockMetaKind } from './internal.ts'
import { createSharedBlockMeta$ } from './shared/internal.ts'
import { isTaskBlockMeta } from './utils.ts'

export interface TaskBlockMeta$ extends SharedBlockMeta$ {
  readonly executorName: ReadonlyVal<string | undefined>
  readonly typing: ReadonlyVal<readonly [language: TypingLanguage, content: string] | undefined>
  /** Absolute path to the script entry file. */
  readonly entry: ReadonlyVal<string | undefined>
  /** Translated manifest.$.additional_inputs_def */
  readonly displayAdditionalInputHandleDefs: ReadonlyVal<InputHandleDef[] | undefined>
}

export class TaskBlockMeta implements SharedBlockMeta {
  public readonly KIND: Record<BlockMetaKind | SharedBlockMetaKind, boolean> = {
    [BlockMetaKind]: true,
    [SharedBlockMetaKind]: true,
  }

  public readonly blockType = 'task'
  public readonly manifestType = 'task'

  public readonly dispose: DisposableStore = disposableStore()

  public readonly $: TaskBlockMeta$

  public readonly wsId: WSId

  public readonly blockResourceName: BlockResourceName

  /** name part of the block path */
  public readonly blockName: BlockName
  public readonly manifestName: BlockName

  public readonly blockDir: string

  public readonly manifestPath: BlockPath

  public static is(blockMeta: unknown): blockMeta is TaskBlockMeta {
    return isTaskBlockMeta(blockMeta)
  }

  public static to(blockMeta: unknown): TaskBlockMeta | undefined {
    if (isTaskBlockMeta(blockMeta)) {
      return blockMeta
    }
  }

  public constructor(
    public readonly blockPath: BlockPath,
    public readonly packageMeta: PackageMeta,
    public readonly searchPath: SearchPath,
    public readonly manifest: WritableTaskBlockManifest,
    resolveResourceUri: ResourceUriResolver,
  ) {
    this.dispose.add(manifest)
    this.blockDir = dirname(blockPath)
    this.manifestPath = blockPath
    this.blockName = this.manifestName = getManifestName(blockPath, this.blockType) as BlockName
    this.wsId = `${packageMeta.packageId}/task/${this.blockName}` as WSId
    this.blockResourceName = encodeBlockResourceName(this.blockName)

    const sharedBlockMeta$ = createSharedBlockMeta$(manifest, resolveResourceUri, packageMeta, blockPath, searchPath)

    this.$ = {
      ...sharedBlockMeta$,
      displayAdditionalInputHandleDefs: packageMeta.l10n.displayHandleDefs$(manifest.$.additional_inputs_def),
      executorName: derive(manifest.$.executor, (executor) => executor?.name),
      typing: compute<[language: TypingLanguage, content: string] | undefined>((get) => {
        const executor = get(manifest.$.executor)
        if (executor?.name === 'javascript') {
          const entry = executor.options?.entry
          if (isString(entry)) {
            const a = get(sharedBlockMeta$.inputHandleDefs)
            const b = get(sharedBlockMeta$.outputHandleDefs)
            if (entry.endsWith('.ts')) {
              return ['typescript', generateTyping('typescript', a, b)]
            } else if (entry.endsWith('.js')) {
              return ['javascript', generateTyping('javascript', a, b)]
            }
          }
        }
      }),
      entry: compute<string | undefined>((get) => {
        const executor = get(manifest.$.executor)
        if (executor?.name === 'javascript') {
          const raw = executor.options?.entry as string | undefined
          const absoluteEntry = raw && (isAbsolute(raw) ? raw : join(this.blockDir, raw))
          return absoluteEntry
        }
      }),
    }
    this.dispose.add(Object.values(this.$))
  }

  public toJSON(): object {
    return this.manifest.toJSON()
  }
}
