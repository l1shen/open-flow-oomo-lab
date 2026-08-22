import type { WritableReactive } from '../../../../base/common/reactivity.ts'
import type { Revision } from '../../../../base/common/revision.ts'
import type { TaskBlockManifest, TaskBlockManifest$ } from '../../model/block/task/taskBlockManifest.ts'
import type { YamlDoc } from '../../yaml.ts'
import type { WritableBlockManifest } from './writableBlockManifest.ts'

import { isEqual } from 'radash'
import { TaskBlockManifestKind, SharedBlockManifestKind, BlockManifestKind } from '../../model/block/internal.ts'
import { parseTaskBlockExecutor } from '../../model/block/task/parse.ts'
import { WritableFileManifest, bindWritableVal } from '../../writableFileManifest.ts'
import { bindSharedWritableBlockValGroup } from './utils.ts'

export type WritableTaskBlockManifest$$ = {
  [K in keyof TaskBlockManifest$]: WritableReactive<TaskBlockManifest$[K]>
}

export class WritableTaskBlockManifest extends WritableFileManifest implements TaskBlockManifest, WritableBlockManifest {
  public readonly KIND: Record<BlockManifestKind | SharedBlockManifestKind | TaskBlockManifestKind, boolean> = {
    [BlockManifestKind]: true,
    [SharedBlockManifestKind]: true,
    [TaskBlockManifestKind]: true,
  }

  public readonly $: TaskBlockManifest$

  public readonly $$: WritableTaskBlockManifest$$

  public constructor(sourceOrDoc: YamlDoc | string, revision?: Revision) {
    super(sourceOrDoc, revision)

    const [blockVals, onYamlParentUpdated] = bindSharedWritableBlockValGroup(this.yamlParent)

    const [executor, onExecutorYamlParentUpdate] = bindWritableVal(this.yamlParent, 'executor', parseTaskBlockExecutor, { equal: isEqual })

    this.$ = this.$$ = { ...blockVals, executor }
    this.onYamlParentUpdated = onYamlParentUpdated.add(onExecutorYamlParentUpdate)

    const vals = Object.values(this.$)
    this.dispose.add(vals)

    const onChanged = () => this.eventEmitter.emit('changed')
    for (const $ of vals) {
      /* disposed by class */ $.reaction(onChanged)
    }
  }
}
