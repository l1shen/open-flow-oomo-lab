import styles from './TranslateIcon.module.scss'

import { clsx } from 'clsx'
import { useLang } from 'val-i18n-react'

export interface TranslateIconProps {
  // Ant Design supplies its menu icon class to provide the right margin.
  className?: string
  translateLang?: string
}

export const TranslateIcon: React.FC<TranslateIconProps> = ({ className, translateLang }) => {
  const lang = useLang()
  return (
    <i className={clsx(styles.icon, className)} role="img">
      <span className={styles.content}>{translateLang?.startsWith('zh') ? (lang.startsWith('zh') ? '中' : 'Zh') : 'En'}</span>
    </i>
  )
}
