import type { BlockManifest } from '../../model/block/base/blockManifest.ts'
import type { OnYamlParentUpdated } from '../../writableFileManifest.ts'
import type { YamlParent } from '../../yaml.ts'

export interface WritableBlockManifest extends BlockManifest {
  yamlParent: YamlParent
  readonly onYamlParentUpdated: OnYamlParentUpdated
}
