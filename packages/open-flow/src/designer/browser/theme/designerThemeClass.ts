import darkTheme from '../styles/dark.module.scss'
import lightTheme from '../styles/light.module.scss'

export function designerThemeClass(dark: boolean): string {
  return dark ? darkTheme.theme : lightTheme.theme
}
