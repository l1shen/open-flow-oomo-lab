import styles from './BottomRight.module.scss'
import type { Val } from 'value-enhancer'
import type { InteractiveMode } from '../../stores/designer/designer.store.ts'

import { MiniMap as RFMiniMap } from '@xyflow/react'
import { clsx } from 'clsx'
import { memo } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { setValue } from 'value-enhancer'
import { Button } from '../../components/button.tsx'
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
    <div className={styles.container}>
      {!miniMapExpanded && (
        <Button
          onClick={() => props.interactiveMode$.set(isMouse ? 'touchpad' : 'mouse')}
          className={styles.btn}
          titlePlacement="top"
          title={modeBtnTitle}
          ariaLabel={modeBtnTitle}
        >
          {isMouse ? <i className={`${styles.interactionIcon} i-custom:mouse`} /> : <i className={`${styles.interactionIcon} i-custom:touchpad`} />}
        </Button>
      )}
      {props.miniMapExpanded$ && (
        <Button
          wrapperClassName={clsx(miniMapExpanded && styles.expanded)}
          className={styles.btn}
          titlePlacement="top"
          title={t('miniMap')}
          ariaLabel={t('miniMap')}
          onClick={() => props.miniMapExpanded$?.set(!props.miniMapExpanded$?.value)}
        >
          {miniMapExpanded ? <i className={`${styles.miniMapIcon} i-carbon:shrink-screen`} /> : <i className={`${styles.miniMapIcon} i-custom:minimap`} />}
        </Button>
      )}
      {!miniMapExpanded && props.showSettings$ && (
        <Button
          onClick={() => setValue(props.showSettings$!, !showSettings)}
          className={clsx(styles.btn, showSettings && styles.btnSelected)}
          titlePlacement="top"
          title={settingsBtnTitle}
          ariaLabel={settingsBtnTitle}
          ariaPressed={showSettings}
        >
          <i className={`${styles.settingsIcon} ${iconOf('settings')}`} />
        </Button>
      )}
      {props.miniMapExpanded$ && miniMapExpanded && <RFMiniMap className={styles.miniMap} pannable zoomable />}
    </div>
  )
})
