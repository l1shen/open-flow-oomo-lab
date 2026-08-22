import type { DisposableStore } from '@wopjs/disposable'
import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { ValueBlockManifest, ValueBlockManifest$ } from '../../model/block/value/valueBlockManifest.ts'
import type { YamlSeq } from '../../yaml.ts'

import { disposableStore } from '@wopjs/disposable'
import { isEqual } from 'radash'
import { Remitter } from 'remitter'
import { ValueBlockManifestKind, BlockManifestKind } from '../../model/block/internal.ts'
import { parseValues } from '../../model/block/value/parse.ts'
import { bindWritableSeq } from '../../writableFileManifest.ts'

export type WritableValueBlockManifest$ = ValueBlockManifest$

export type WritableValueBlockManifest$$ = {
  [K in keyof ValueBlockManifest$]: WritableReactive<WritableValueBlockManifest$[K]>
}

export interface WritableValueBlockManifestEvent {
  changed: void
}

export class WritableValueBlockManifest implements ValueBlockManifest {
  public readonly KIND: Record<BlockManifestKind | ValueBlockManifestKind, boolean> = {
    [ValueBlockManifestKind]: true,
    [BlockManifestKind]: true,
  }

  public readonly $: WritableValueBlockManifest$

  public readonly $$: WritableValueBlockManifest$$

  public static is(block: unknown): block is WritableValueBlockManifest {
    return block instanceof WritableValueBlockManifest
  }

  public static to(block: unknown): WritableValueBlockManifest | undefined {
    if (WritableValueBlockManifest.is(block)) {
      return block
    }
  }

  public readonly dispose: DisposableStore = disposableStore()

  public readonly events: Remitter<WritableValueBlockManifestEvent>

  public valuesYaml: YamlSeq

  public readonly updateValuesYaml: (valuesYaml: YamlSeq) => void

  public constructor(valuesYaml: YamlSeq) {
    this.valuesYaml = valuesYaml

    this.events = this.dispose.add(new Remitter())

    const [values, onYamlSeqUpdated] = bindWritableSeq(valuesYaml, parseValues, { equal: isEqual })

    this.$ = this.$$ = { values }
    this.updateValuesYaml = onYamlSeqUpdated

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.events.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
  }

  public toJSON(): object {
    return this.valuesYaml.toJSON()
  }
}
