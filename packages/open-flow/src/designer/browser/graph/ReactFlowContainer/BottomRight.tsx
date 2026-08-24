import styles from './BottomRight.module.scss'
import type { Val } from 'value-enhancer'
import type { InteractiveMode } from '../../stores/designer/designer.store.ts'

import { MiniMap as RFMiniMap } from '@xyflow/react'
import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { setValue } from 'value-enhancer'
import { Button } from '../../../../ui/browser/button.tsx'
import { CanvasControlGroup } from '../../components/canvasControlGroup.tsx'
import { DesignerTooltip } from '../../components/tooltip.tsx'
import { iconOf } from '../../jsonSchema/preset.ts'

export interface BottomRightProps {
  miniMapExpanded$?: Val<boolean | undefined>
  interactiveMode$: Val<InteractiveMode>
  showSettings$?: Val<boolean>
}

export const BottomRight: React.FC<BottomRightProps> = /* @__PURE__ */ memo(function (props: BottomRightProps) {
  const t = useTranslate()
  const miniMapExpanded = useVal(props.miniMapExpanded$)
  const showSettings = useVal(props.showSettings$)

  const isMouse = useVal(props.interactiveMode$) === 'mouse'
  const modeBtnTitle = isMouse ? t('interactiveMode.mouse') : t('interactiveMode.touchpad')
  const settingsBtnTitle = t(showSettings ? 'settingsPanel.hide' : 'settingsPanel.show')

  return (
    <CanvasControlGroup className={clsx(styles.container, miniMapExpanded && styles.miniMapOpen)}>
      {!miniMapExpanded && (
        <DesignerTooltip placement="top" title={modeBtnTitle}>
          <Button aria-label={modeBtnTitle} onClick={() => props.interactiveMode$.set(isMouse ? 'touchpad' : 'mouse')} size="icon-sm" variant="ghost">
            {isMouse ? <i className={`${styles.interactionIcon} i-custom:mouse`} /> : <i className={`${styles.interactionIcon} i-custom:touchpad`} />}
          </Button>
        </DesignerTooltip>
      )}
      {props.miniMapExpanded$ && (
        <DesignerTooltip placement="top" title={t('miniMap')}>
          <Button
            aria-label={t('miniMap')}
            className={miniMapExpanded ? styles.expanded : undefined}
            onClick={() => props.miniMapExpanded$?.set(!props.miniMapExpanded$?.value)}
            size="icon-sm"
            variant="ghost"
          >
            {miniMapExpanded ? <i className={`${styles.miniMapIcon} i-carbon:shrink-screen`} /> : <i className={`${styles.miniMapIcon} i-custom:minimap`} />}
          </Button>
        </DesignerTooltip>
      )}
      {!miniMapExpanded && props.showSettings$ && (
        <DesignerTooltip placement="top" title={settingsBtnTitle}>
          <Button
            aria-label={settingsBtnTitle}
            aria-expanded={showSettings}
            onClick={() => setValue(props.showSettings$!, !showSettings)}
            size="icon-sm"
            variant="ghost"
          >
            <i className={`${styles.settingsIcon} ${iconOf('settings')}`} />
          </Button>
        </DesignerTooltip>
      )}
      {props.miniMapExpanded$ && miniMapExpanded && <RFMiniMap className={styles.miniMap} pannable zoomable />}
    </CanvasControlGroup>
  )
})
