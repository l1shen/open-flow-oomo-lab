import styles from './videoPreview.module.scss'
import type { FC } from 'react'

import { makeFreshMediaUrl } from './mediaUrl.ts'

export interface VideoPreviewProps {
  src: string
}

export const VideoPreview: FC<VideoPreviewProps> = ({ src }) => {
  return (
    <div className={styles.container}>
      <video className={styles.video} src={makeFreshMediaUrl(src)} controls controlsList="nofullscreen" playsInline />
    </div>
  )
}
