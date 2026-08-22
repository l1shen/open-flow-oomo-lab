import styles from './SubflowToggleButton.module.scss'
import type { SubflowViewMode } from '../../stores/designer/subflowDesigner.store.ts'

import { Segmented } from 'antd'
import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
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
      <Segmented<SubflowViewMode>
        rootClassName={styles.segments}
        options={[
          {
            label: t('subflowEditor.blockMode'),
            value: SUBFLOW_VIEW_MODE.Block,
          },
          {
            label: t('subflowEditor.flowMode'),
            value: SUBFLOW_VIEW_MODE.Flow,
          },
        ]}
        value={viewMode}
        onChange={(value) => designerStore.$$.viewMode.set(value)}
      />
    </div>
  )
})
