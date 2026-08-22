import styles from './DesignerIcon.module.scss'

import { clsx } from 'clsx'
import { useMemo, useState } from 'react'
import { IconifyIcon } from './IconifyIcon.tsx'

export interface DesignerIconProps {
  /** Can be an image URL or in the form of `":{collection}:{icon}:{color}:"`, like `":mdi:loading:red:"`. */
  src?: string
  /** Applied to the `<img>` element. */
  className?: string
  /** Fallback element if the `<img>` load failed. */
  fallback?: React.ReactNode
}

export const DesignerIcon = ({ src, className, fallback = null }: DesignerIconProps) => {
  const result = useMemo(() => parseIconifyIcon(src), [src])
  const [error, setError] = useState<string>()
  const onError = () => setError(src)

  if (!src || src === error) {
    return fallback as React.ReactElement
  }

  return result ? (
    <IconifyIcon collection={result.collection} icon={result.icon} color={result.color} className={className} onError={onError} />
  ) : (
    <img className={clsx(styles.img, className)} src={src} alt="" decoding="async" loading="lazy" referrerPolicy="no-referrer" onError={onError} />
  )
}

export function parseIconifyIcon(src: string | undefined): { collection: string; icon: string; color: string } | null {
  // src = :{collection}:{icon}:{color}:
  if (src && src.length > 2 && src[0] === ':' && src.endsWith(':')) {
    const [, collection, icon, color] = src.split(':')
    if (collection && icon) {
      return { collection, icon, color: color || 'currentColor' }
    } else {
      console.warn(`Don't load icon spec: ${src}`)
    }
  }
  return null
}
