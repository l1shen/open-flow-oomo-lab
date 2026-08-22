import 'overlayscrollbars/overlayscrollbars.css'
import styles from './overlayScrollbar.module.scss'
import type { EventListeners, PartialOptions } from 'overlayscrollbars'
import type { OverlayScrollbarsComponentRef } from 'overlayscrollbars-react'

import { clsx } from 'clsx'
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react'
import { useMemo, forwardRef } from 'react'
import { useThemeData } from '../theme/ThemeProvider.tsx'

export type OverlayScrollbarRef = OverlayScrollbarsComponentRef<'div'>

export interface OverlayScrollbarProps {
  className?: string
  defer?: boolean
  events?: EventListeners
  style?: React.CSSProperties
  tabIndex?: number
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void
  children?: React.ReactNode
}

export const OverlayScrollbar: React.ForwardRefExoticComponent<OverlayScrollbarProps & React.RefAttributes<OverlayScrollbarRef>> = forwardRef<
  OverlayScrollbarRef,
  OverlayScrollbarProps
>(({ className, defer = true, events, style, tabIndex, onClick, children }, ref) => {
  const dark = useThemeData().isDark
  const options = useMemo(
    (): PartialOptions => ({
      scrollbars: {
        theme: dark ? 'os-theme-light' : 'os-theme-dark',
        autoHide: 'leave',
        autoHideDelay: 300,
      },
      overflow: {
        x: 'hidden',
      },
    }),
    [dark],
  )

  return (
    <OverlayScrollbarsComponent
      defer={defer}
      events={events}
      ref={ref}
      className={clsx(styles.container, className)}
      style={style}
      options={options}
      tabIndex={tabIndex}
      onClick={onClick}
    >
      {children}
    </OverlayScrollbarsComponent>
  )
})
