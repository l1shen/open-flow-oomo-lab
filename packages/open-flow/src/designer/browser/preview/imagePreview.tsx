import type { FC } from 'react'

import { clsx } from 'clsx'
import { makeFreshMediaUrl } from './mediaUrl.ts'

export interface ImagePreviewProps {
  src: string
  className?: string
}

export const ImagePreview: FC<ImagePreviewProps> = ({ src, className }) => {
  return <img className={clsx('block w-full h-full p-0 object-contain', className)} src={makeFreshMediaUrl(src)} />
}
