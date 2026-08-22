import type { DisposableStore } from '@wopjs/disposable'
import type { ReadonlyVal } from 'value-enhancer'
import type { FlowLikePath, SearchPath } from '../../manifestTypes.ts'
import type { WritableInlineTaskBlockManifest } from '../../writable/block/writableInlineTaskBlockManifest.ts'
import type { PackageMeta } from '../package/packageMeta.ts'
import type { TypingLanguage } from './generateTyping.ts'
import type { InlineBlockMeta, InlineBlockMeta$ } from './inlineBlockMeta.ts'

import { isString, isTruthy } from '@wopjs/cast'
import { disposableStore } from '@wopjs/disposable'
import { compute, derive } from 'value-enhancer'
import { dirname, isAbsolute, isParent, join } from '../../../../base/common/posixPath.ts'
import { isInlineTaskBlockManifest } from '../../model/block/inlineTaskBlockManifest.ts'
import { scriptletDirectory } from '../../scriptlet.ts'
import { generateTyping } from './generateTyping.ts'
import { isInlineBlockMeta } from './inlineBlockMeta.ts'
import { BlockMetaKind, createInlineBlockMeta$, InlineBlockMetaKind } from './internal.ts'

export interface InlineTaskBlockMeta$ extends InlineBlockMeta$ {
  readonly executorName: ReadonlyVal<string | undefined>
  readonly typing: ReadonlyVal<readonly [language: TypingLanguage, content: string] | undefined>
}

export class InlineTaskBlockMeta implements InlineBlockMeta {
  public readonly KIND: Record<BlockMetaKind | InlineBlockMetaKind, boolean> = {
    [BlockMetaKind]: true,
    [InlineBlockMetaKind]: true,
  }

  public readonly dispose: DisposableStore = disposableStore()

  public readonly $: InlineTaskBlockMeta$

  public static is(blockMeta: any): blockMeta is InlineTaskBlockMeta {
    return isInlineBlockMeta(blockMeta) && isInlineTaskBlockManifest(blockMeta?.manifest)
  }

  public static to(blockMeta: any): InlineTaskBlockMeta | undefined {
    if (InlineTaskBlockMeta.is(blockMeta)) {
      return blockMeta
    }
  }

  public constructor(
    public readonly flowLikePath: FlowLikePath,
    public readonly searchPath: SearchPath,
    public readonly manifest: WritableInlineTaskBlockManifest,
    public readonly packageMeta: PackageMeta,
  ) {
    this.dispose.add(manifest)

    const inlineBlockMeta$ = createInlineBlockMeta$(manifest, packageMeta.l10n)

    this.$ = {
      ...inlineBlockMeta$,
      executorName: derive(manifest.$.executor, (executor) => executor?.name),
      typing: compute<[language: TypingLanguage, content: string] | undefined>((get) => {
        const executor = get(manifest.$.executor)
        if (executor?.name === 'javascript') {
          const entry = executor.options?.entry
          if (isString(entry)) {
            const a = get(inlineBlockMeta$.inputHandleDefs)
            const b = get(inlineBlockMeta$.outputHandleDefs)
            if (entry.endsWith('.ts')) {
              return ['typescript', generateTyping('typescript', a, b)]
            } else if (entry.endsWith('.js')) {
              return ['javascript', generateTyping('javascript', a, b)]
            }
          }
        }
      }),
    }

    this.dispose.add(Object.values(this.$).filter(isTruthy))
  }

  public getScriptletEntryPath(): string | undefined {
    const absoluteEntry = this.getEntryPath()
    const isScriptlet = absoluteEntry && isParent(absoluteEntry, join(dirname(this.flowLikePath), scriptletDirectory))

    if (isScriptlet) {
      return absoluteEntry
    }
  }

  public getEntryPath(): string | undefined {
    const executor = this.manifest.$.executor.value
    const relativeEntry = executor?.name == 'javascript' ? executor.options.entry : undefined
    return relativeEntry && (isAbsolute(relativeEntry) ? relativeEntry : join(dirname(this.flowLikePath), relativeEntry))
  }

  public toJSON(): object {
    return this.manifest.toJSON()
  }
}
