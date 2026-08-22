import type { DisposableStore } from '@wopjs/disposable'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { InlineConditionBlock } from '../../../../schema/index.ts'
import type { ConditionBlockManifest, ConditionBlockManifest$ } from '../../model/block/condition/conditionBlockManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlMap, YamlParent } from '../../yaml.ts'
import type { WritableBlockManifest } from './writableBlockManifest.ts'

import { disposableStore } from '@wopjs/disposable'
import { isEqual, mapValues } from 'radash'
import { Remitter } from 'remitter'
import { parseConditionsDef, parseDefaultConditionHandleDef } from '../../model/block/condition/parse.ts'
import { BlockManifestKind, ConditionBlockManifestKind } from '../../model/block/internal.ts'
import { bindWritableValGroup } from '../../writableFileManifest.ts'

export interface WritableConditionBlockManifest$ extends ConditionBlockManifest$ {}

export type WritableConditionBlockManifest$$ = {
  [K in keyof WritableConditionBlockManifest$]: WritableReactive<WritableConditionBlockManifest$[K]>
}

export interface WritableConditionBlockManifestEvent {
  changed: void
}

export class WritableConditionBlockManifest implements ConditionBlockManifest, WritableBlockManifest {
  public readonly KIND: Record<BlockManifestKind | ConditionBlockManifestKind, boolean> = {
    [BlockManifestKind]: true,
    [ConditionBlockManifestKind]: true,
  }

  public static is(manifest: unknown): manifest is WritableConditionBlockManifest {
    return manifest instanceof WritableConditionBlockManifest
  }

  public static to(manifest: unknown): WritableConditionBlockManifest | undefined {
    if (WritableConditionBlockManifest.is(manifest)) {
      return manifest
    }
  }

  public readonly dispose: DisposableStore = disposableStore()

  public readonly events: Remitter<WritableConditionBlockManifestEvent> = new Remitter()

  public readonly $: WritableConditionBlockManifest$

  public readonly $$: WritableConditionBlockManifest$$

  public yamlParent: YamlParent

  public readonly onYamlParentUpdated: OnYamlParentUpdated

  public constructor(conditionsYaml: YamlMap) {
    this.yamlParent = conditionsYaml

    const [blockVals, onYamlParentUpdated] = bindWritableValGroup<Required<InlineConditionBlock>>(conditionsYaml, {
      cases: { parser: parseConditionsDef, config: { equal: isEqual } },
      default: { parser: parseDefaultConditionHandleDef, config: { equal: isEqual } },
    })

    this.$ = this.$$ = blockVals
    this.onYamlParentUpdated = onYamlParentUpdated.add((nextConditionsYaml) => (this.yamlParent = nextConditionsYaml))

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.events.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
  }

  public toJSON(): InlineConditionBlock {
    return mapValues(this.$, (value) => value.value) as InlineConditionBlock
  }
}
