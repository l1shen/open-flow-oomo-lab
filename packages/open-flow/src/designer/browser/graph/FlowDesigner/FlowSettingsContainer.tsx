import styles from './FlowSettingsContainer.module.scss'
import type { JSX } from 'react/jsx-runtime'

import { ConfigProvider } from 'antd'
import { useVal } from 'use-value-enhancer'
import { NodeMiniMapPhase, NodeMiniMapProvider } from '../../components/minimap.tsx'
import { useDesignerStore } from '../DesignerStoreContext.tsx'
import { useGetStaticPopupContainer } from '../ReactFlowContainer/useGetPopupContainer.ts'
import { FlowSettings } from './FlowSettings.tsx'

export interface FlowSettingsContainerProps {}

export function FlowSettingsContainer(_props: FlowSettingsContainerProps): JSX.Element {
  const getStaticDesignerContainer = useGetStaticPopupContainer()
  const designerStore = useDesignerStore()
  const showSettings = useVal(designerStore.$$.showSettings)

  return (
    <NodeMiniMapProvider value={NodeMiniMapPhase.None}>
      <ConfigProvider getPopupContainer={getStaticDesignerContainer}>
        {showSettings && (
          <div className={styles.container}>
            <FlowSettings
              designerType={designerStore.designerType}
              showSettings$={designerStore.$$.showSettings}
              panelWidth$={designerStore.$$.settingsPanelWidth}
            />
          </div>
        )}
      </ConfigProvider>
    </NodeMiniMapProvider>
  )
}
