import styles from './iconPicker.module.scss'
import type { IDisposable } from '@wopjs/disposable'
import type { IconPickerResult } from '../icons/IconPicker/IconPicker.tsx'

import { useCallback, useEffect } from 'react'
import { useLang } from 'val-i18n-react'
import { useIsMounted } from '../base/react.ts'
import { IconPicker } from '../icons/IconPicker/IconPicker.tsx'

export interface OpenIconPicker {
  (setIcon: (icon: string) => void, placement?: 'top' | 'bottom'): void
}

// Keep one picker open at a time.
let iconPickerInstance: IDisposable | undefined

export function useOpenIconPicker(): OpenIconPicker {
  const lang = useLang()
  const isMounted = useIsMounted()

  useEffect(() => () => iconPickerInstance?.dispose(), [])

  const openIconPicker = useCallback(
    async (setIcon: (icon: string) => void, placement?: 'top' | 'bottom') => {
      // Wait for the active element to update.
      await new Promise((resolve) => setTimeout(resolve, 0))
      const anchor = document.activeElement
      if (anchor instanceof HTMLElement) {
        iconPickerInstance?.dispose()
        const result = await (iconPickerInstance = IconPicker.open({
          anchor,
          placement,
          locale: lang,
          emoji: true,
          className: styles.iconPicker,
        }))
        if (result && isMounted()) {
          setIcon(encodeIcon(result))
        }
      }
    },
    [isMounted, lang],
  )

  return openIconPicker
}

export function encodeIcon({ collection, icon, color }: IconPickerResult): string {
  return color.toLowerCase() === 'currentcolor' ? `:${collection}:${icon}:` : `:${collection}:${icon}:${color}:`
}
