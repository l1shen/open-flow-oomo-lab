import styles from './DisplayModeToggle.module.scss'
import type { Val } from 'value-enhancer'
import type { FlowDisplayMode } from '../../../common/flowDisplay.ts'

import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useLang, useTranslate } from 'val-i18n-react'
import { Button } from '../../components/button.tsx'

export interface DisplayModeToggleProps {
  displayMode$: Val<FlowDisplayMode>
}

export const DisplayModeToggle: React.FC<DisplayModeToggleProps> = /*#__PURE__*/ memo(function DisplayModeToggle({ displayMode$ }) {
  const t = useTranslate()
  const lang = useLang()
  const displayMode = useVal(displayMode$)

  return (
    <div className={clsx(styles.container, lang == 'zh-CN' && styles.compact)}>
      <Button
        ariaLabel={t('flowDisplayMode.overview')}
        ariaPressed={displayMode == 'overview'}
        className={clsx(styles.button, displayMode == 'overview' && styles.buttonActive)}
        title={t('flowDisplayMode.overviewDescription')}
        titlePlacement="top"
        onClick={() => displayMode$.set('overview')}
      >
        {t('flowDisplayMode.overview')}
      </Button>
      <Button
        ariaLabel={t('flowDisplayMode.detail')}
        ariaPressed={displayMode == 'detail'}
        className={clsx(styles.button, displayMode == 'detail' && styles.buttonActive)}
        title={t('flowDisplayMode.detailDescription')}
        titlePlacement="top"
        onClick={() => displayMode$.set('detail')}
      >
        {t('flowDisplayMode.detail')}
      </Button>
    </div>
  )
})
