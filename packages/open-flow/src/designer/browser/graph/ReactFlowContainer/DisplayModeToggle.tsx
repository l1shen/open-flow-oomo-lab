import styles from './DisplayModeToggle.module.scss'
import type { Val } from 'value-enhancer'
import type { FlowDisplayMode } from '../../../common/flowDisplay.ts'

import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { Tabs, TabsList, TabsTrigger } from '../../../../ui/browser/tabs.tsx'

export interface DisplayModeToggleProps {
  displayMode$: Val<FlowDisplayMode>
}

export const DisplayModeToggle: React.FC<DisplayModeToggleProps> = /*#__PURE__*/ memo(function DisplayModeToggle({ displayMode$ }) {
  const t = useTranslate()
  const displayMode = useVal(displayMode$)

  return (
    <div className={styles.container} data-canvas-control-scope>
      <Tabs
        onValueChange={(value) => {
          if (value == 'overview' || value == 'detail') displayMode$.set(value)
        }}
        value={displayMode}
      >
        <TabsList aria-label={t('flowDisplayMode.overviewDescription')}>
          <TabsTrigger title={t('flowDisplayMode.overviewDescription')} value="overview">
            {t('flowDisplayMode.overview')}
          </TabsTrigger>
          <TabsTrigger title={t('flowDisplayMode.detailDescription')} value="detail">
            {t('flowDisplayMode.detail')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  )
})
