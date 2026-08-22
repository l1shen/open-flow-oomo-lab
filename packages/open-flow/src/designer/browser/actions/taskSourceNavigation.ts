import type { I18n } from 'val-i18n'
import type { InlineTaskBlockMeta } from '../../../manifest/common/meta/block/inlineTaskBlockMeta.ts'
import type { TaskBlockMeta } from '../../../manifest/common/meta/block/taskBlockMeta.ts'
import type { PackageAuthoring } from '../../common/packageAuthoring.ts'
import type { DesignerNotification } from '../notification.ts'
import type { ResourceNavigation } from '../resourceNavigation.ts'

import { isString } from '@wopjs/cast'

export async function openSharedTaskSource(
  packageAuthoring: PackageAuthoring,
  navigation: ResourceNavigation,
  notification: DesignerNotification,
  i18n: I18n,
  blockMeta: TaskBlockMeta,
): Promise<void> {
  const executor = blockMeta.manifest.$.executor.value
  const entry = executor?.name == 'javascript' ? executor.options.entry : undefined
  if (isString(entry)) {
    const sourceCodePath = await packageAuthoring.resolveTaskEntryPath(blockMeta.blockPath, entry)
    if (sourceCodePath) {
      await navigation.open(sourceCodePath)
    } else {
      notification.error(i18n.t('blockEditor.sourceNotFound'))
    }
  }
}

export async function openInlineTaskEntry(
  navigation: ResourceNavigation,
  notification: DesignerNotification,
  i18n: I18n,
  blockMeta: InlineTaskBlockMeta,
): Promise<void> {
  const entryPath = blockMeta.getEntryPath()
  if (entryPath) {
    await navigation.open(entryPath)
  } else {
    notification.error(i18n.t('blockEditor.sourceNotFound'))
  }
}
