import styles from './SubflowToggleButton.module.scss'
import type { SubflowViewMode } from '../../stores/designer/subflowDesigner.store.ts'

import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { ToggleGroup, ToggleGroupItem } from '../../../../ui/browser/toggle-group.tsx'
import { SUBFLOW_VIEW_MODE } from '../../stores/designer/subflowDesigner.store.ts'
import { DESIGNER_TYPE } from '../../stores/designer/typings.ts'
import { useDesignerStoreAs } from '../DesignerStoreContext.tsx'

export const SubflowToggleButton: React.FC = /*#__PURE__*/ memo(function SubflowToggleButton() {
  const t = useTranslate()
  const designerStore = useDesignerStoreAs(DESIGNER_TYPE.Subflow)
  const viewMode = useVal(designerStore?.$.viewMode)

  if (!designerStore) {
    return null
  }

  return (
    <div className={clsx(styles.container, viewMode === SUBFLOW_VIEW_MODE.Flow ? styles.showFlow : styles.showNode)}>
      <ToggleGroup<SubflowViewMode>
        className={styles.segments}
        size="sm"
        spacing={0}
        value={viewMode ? [viewMode] : []}
        onValueChange={(values) => {
          const value = values.at(-1)
          if (value != null) designerStore.$$.viewMode.set(value)
        }}
        variant="outline"
      >
        <ToggleGroupItem value={SUBFLOW_VIEW_MODE.Block}>{t('subflowEditor.blockMode')}</ToggleGroupItem>
        <ToggleGroupItem value={SUBFLOW_VIEW_MODE.Flow}>{t('subflowEditor.flowMode')}</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
})
