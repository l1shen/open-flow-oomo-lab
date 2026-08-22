/* @unocss-include */

import type { WidgetActionType } from '../../stores/node/constants.ts'

export const INPUT_FACTORS = { '--name-factor': 1, '--value-factor': 2 } as React.CSSProperties & {
  [key: string]: unknown
}
export const CONDITION_FACTORS = { '--name-factor': 2, '--value-factor': 3 } as React.CSSProperties & {
  [key: string]: unknown
}

export const WIDGET_ACTION_ICON: Record<WidgetActionType, `i-${string}:${string}`> = {
  download: 'i-codicon:cloud-download',
  openInNewTab: 'i-carbon:new-tab',
  reload: 'i-codicon:refresh',
}
