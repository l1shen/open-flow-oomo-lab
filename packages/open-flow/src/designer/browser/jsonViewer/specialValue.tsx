import styles from './specialValue.module.scss'
import type { JSX } from 'react/jsx-runtime'

import { useTranslate } from 'val-i18n-react'

export interface SpecialValueProps {
  type: string
  value?: string
}

export const SpecialValue = ({ type, value }: SpecialValueProps): JSX.Element => {
  const t = useTranslate()
  let title = type
  let icon = ''

  if (type === 'secret') {
    title = `${t('jsonViewer.secret')}: ${value || 'unknown'}`
    icon = 'i-carbon:key'
  } else if (type === 'bin') {
    title = t('jsonViewer.bin')
    value = `${title}…`
    icon = 'i-carbon:transform-binary'
  } else if (type === 'variable') {
    title = `${t('jsonViewer.var')}`
    value = `${t('jsonViewer.var')}…`
    icon = 'i-carbon:value-variable'
  }

  return (
    <span title={title} className={styles.container}>
      {icon && <i className={`${icon} ${styles.icon}`} />}
      {value}
    </span>
  )
}

export const getSpecialValueKind = (type: string): string => {
  switch (type) {
    case 'OO_SECRET':
      return 'secret'
    case 'oomol/bin':
      return 'bin'
    case 'oomol/var':
      return 'variable'
    default:
      return type
  }
}
