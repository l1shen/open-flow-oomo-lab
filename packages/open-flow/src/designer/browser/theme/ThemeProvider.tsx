import type { JSX } from 'react/jsx-runtime'
import type { AntdProviderProps } from './AntdProvider.tsx'

import { createContext, useContext, useMemo } from 'react'
import { AntdProvider } from './AntdProvider.tsx'

export interface ThemeData {
  isDark: boolean
}

export interface ThemeProviderProps extends AntdProviderProps {}

const ThemeContext = createContext<ThemeData | null>({ isDark: false })

export function ThemeProvider(props: ThemeProviderProps): JSX.Element {
  const theme = useMemo(() => ({ isDark: props.dark }), [props.dark])

  return (
    <ThemeContext.Provider value={theme}>
      <AntdProvider {...props} />
    </ThemeContext.Provider>
  )
}

export const useThemeData = (): ThemeData => {
  const data = useContext(ThemeContext)

  if (!data) {
    throw new Error('Must be used within a ThemeProvider')
  }

  return data
}
