import type { Option } from '@wopjs/tsur'
import type { WritableReactive } from '../../../base/common/reactivity.ts'
import type { Revision } from '../../../base/common/revision.ts'
import type { PackageName } from '../manifestTypes.ts'
import type { PackageManifest, PackageManifest$ } from '../model/package/packageManifest.ts'
import type { YamlDoc } from '../yaml.ts'

import { parseString } from '../../../base/common/parse.ts'
import { PackageManifestKind } from '../model/package/internal.ts'
import { WritableFileManifest, bindWritableValGroup } from '../writableFileManifest.ts'
import { writeMultilineStringYamlScalar } from '../yaml.ts'

export type WritablePackageManifest$$ = {
  [K in keyof PackageManifest$]: WritableReactive<PackageManifest$[K]>
}

export class WritablePackageManifest extends WritableFileManifest implements PackageManifest {
  public readonly KIND: Record<PackageManifestKind, boolean> = {
    [PackageManifestKind]: true,
  }

  public readonly $: PackageManifest$

  public readonly $$: WritablePackageManifest$$

  public constructor(sourceOrDoc?: YamlDoc | string, revision?: Revision) {
    super(sourceOrDoc, revision)

    ;[this.$$, this.onYamlParentUpdated] = bindWritableValGroup(this.yamlParent, {
      name: parseString as (data: unknown) => Option<PackageName>,
      displayName: parseString,
      icon: parseString,
      description: {
        parser: parseString,
        writeYamlValue: writeMultilineStringYamlScalar,
      },
    })

    this.$ = this.$$

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
  }

  public override toJSON(): object {
    return super.toJSON() ?? {}
  }
}
