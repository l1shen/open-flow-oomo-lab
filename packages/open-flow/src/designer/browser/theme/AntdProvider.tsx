import type { ThemeConfig } from 'antd'

import { theme, ConfigProvider } from 'antd'
import { useMemo } from 'react'

const ANTD_TOKEN_COMMON: Required<ThemeConfig>['token'] = {
  motion: false,
  colorPrimary: 'var(--brand-highlight-color)',
  controlItemBgActive: 'var(--widget-time-picker-active-bg)',
}

const antdDarkToken = (): Required<ThemeConfig>['token'] => ({
  ...ANTD_TOKEN_COMMON,
  colorBgLayout: 'var(--flow-bg)',
})

const antdLightToken = (): Required<ThemeConfig>['token'] => ({
  ...ANTD_TOKEN_COMMON,
  colorBgLayout: 'var(--flow-bg)',
})

const antdComponentsToken = (darkMode: boolean): Required<ThemeConfig>['components'] => ({
  Dropdown: {
    paddingXXS: 4,
    paddingBlock: 4,
    borderRadius: 4,
    borderRadiusSM: 4,
    borderRadiusLG: 4,
    borderRadiusOuter: 5,
    controlItemBgHover: 'var(--widget-background-highlight-color)',
    colorBgElevated: 'var(--widget-popup-background)',
    boxShadowSecondary: darkMode ? '0px 2px 16px 0px #0000005c' : '0px 2px 16px 0px #00000016',
  },
  Segmented: {
    fontSize: 12,
    trackPadding: 3,
    trackBg: 'var(--widget-segmented-track-bg)',
    itemHoverBg: 'var(--widget-segmented-item-hover-bg)',
    itemSelectedColor: 'var(--widget-segmented-font-color)',
    itemSelectedBg: 'var(--widget-segmented-item-selected-bg)',
  },
})

export interface AntdProviderProps {
  dark: boolean
  getPopupContainer?: (triggerNode?: HTMLElement) => HTMLElement
  children?: React.ReactNode
}

export const AntdProvider: React.FC<AntdProviderProps> = ({ dark, getPopupContainer, children }) => {
  const themeConfig = useMemo(
    (): ThemeConfig => ({
      token: dark ? antdDarkToken() : antdLightToken(),
      algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
      components: antdComponentsToken(dark),
    }),
    [dark],
  )

  return (
    <ConfigProvider getPopupContainer={getPopupContainer} theme={themeConfig}>
      {children}
    </ConfigProvider>
  )
}
