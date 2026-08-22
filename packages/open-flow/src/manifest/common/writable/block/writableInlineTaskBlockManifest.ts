import type { DisposableStore } from '@wopjs/disposable'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { InlineTaskBlock } from '../../../../schema/index.ts'
import type { InlineTaskBlockManifest, InlineTaskBlockManifest$ } from '../../model/block/inlineTaskBlockManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlParent, YamlMap } from '../../yaml.ts'
import type { WritableInlineBlockManifest } from './writableInlineBlockManifest.ts'

import { disposableStore } from '@wopjs/disposable'
import { isEqual, mapValues } from 'radash'
import { Remitter } from 'remitter'
import { BlockManifestKind, InlineBlockManifestKind, InlineTaskBlockManifestKind } from '../../model/block/internal.ts'
import { parseTaskBlockExecutor } from '../../model/block/task/parse.ts'
import { bindWritableVal } from '../../writableFileManifest.ts'
import { bindInlineWritableBlockValGroup } from './utils.ts'

export type WritableInlineTaskBlockManifest$ = InlineTaskBlockManifest$

export type WritableInlineTaskBlockManifest$$ = {
  [K in keyof WritableInlineTaskBlockManifest$]: WritableReactive<WritableInlineTaskBlockManifest$[K]>
}

export interface WritableInlineTaskBlockManifestEvent {
  changed: void
}

export class WritableInlineTaskBlockManifest implements WritableInlineBlockManifest, InlineTaskBlockManifest {
  public readonly KIND: Record<BlockManifestKind | InlineBlockManifestKind | InlineTaskBlockManifestKind, boolean> = {
    [BlockManifestKind]: true,
    [InlineBlockManifestKind]: true,
    [InlineTaskBlockManifestKind]: true,
  }

  public static is(manifest: unknown): manifest is WritableInlineTaskBlockManifest {
    return manifest instanceof WritableInlineTaskBlockManifest
  }

  public static to(manifest: unknown): WritableInlineTaskBlockManifest | undefined {
    if (WritableInlineTaskBlockManifest.is(manifest)) {
      return manifest
    }
  }

  public readonly dispose: DisposableStore = disposableStore()

  public readonly events: Remitter<WritableInlineTaskBlockManifestEvent> = new Remitter<WritableInlineTaskBlockManifestEvent>()

  public readonly $: WritableInlineTaskBlockManifest$

  public readonly $$: WritableInlineTaskBlockManifest$$

  public yamlParent: YamlParent

  public readonly onYamlParentUpdated: OnYamlParentUpdated

  public constructor(taskYaml: YamlMap) {
    this.yamlParent = taskYaml

    const [blockVals, onYamlParentUpdated] = bindInlineWritableBlockValGroup(taskYaml)

    const [executor, onExecutorYamlParentUpdate] = bindWritableVal(taskYaml, 'executor', parseTaskBlockExecutor, {
      equal: isEqual,
    })

    this.$ = this.$$ = { ...blockVals, executor }
    this.onYamlParentUpdated = onYamlParentUpdated.add(onExecutorYamlParentUpdate).add((nextTaskYaml) => (this.yamlParent = nextTaskYaml))

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.events.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
  }

  public toJSON(): InlineTaskBlock {
    return mapValues(this.$, (value) => value.value) as InlineTaskBlock
  }
}
