import type { Val } from 'value-enhancer'
import type { FlowDisplayMode } from '../../../common/flowDisplay.ts'

import { Panel } from '@xyflow/react'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { ToggleGroup, ToggleGroupItem } from '../../../../ui/browser/toggle-group.tsx'

export interface DisplayModeToggleProps {
  displayMode$: Val<FlowDisplayMode>
}

export const DisplayModeToggle: React.FC<DisplayModeToggleProps> = /*#__PURE__*/ memo(function DisplayModeToggle({ displayMode$ }) {
  const t = useTranslate()
  const displayMode = useVal(displayMode$)

  return (
    <Panel data-canvas-control-scope position="bottom-center">
      <ToggleGroup<FlowDisplayMode>
        aria-label={t('flowDisplayMode.overviewDescription')}
        onValueChange={(values) => {
          const value = values.at(-1)
          if (value != null) displayMode$.set(value)
        }}
        spacing={0}
        value={[displayMode]}
        variant="outline"
      >
        <ToggleGroupItem title={t('flowDisplayMode.overviewDescription')} value="overview">
          {t('flowDisplayMode.overview')}
        </ToggleGroupItem>
        <ToggleGroupItem title={t('flowDisplayMode.detailDescription')} value="detail">
          {t('flowDisplayMode.detail')}
        </ToggleGroupItem>
      </ToggleGroup>
    </Panel>
  )
})
