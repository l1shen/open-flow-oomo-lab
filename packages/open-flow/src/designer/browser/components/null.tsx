import styles from './null.module.scss'
import type { JSX } from 'react/jsx-runtime'

export function Null(): JSX.Element {
  return <span className={styles.null}>null</span>
}
