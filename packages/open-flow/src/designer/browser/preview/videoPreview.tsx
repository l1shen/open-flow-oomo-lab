import type { FC } from 'react'

import { makeFreshMediaUrl } from './mediaUrl.ts'

export interface VideoPreviewProps {
  src: string
}

export const VideoPreview: FC<VideoPreviewProps> = ({ src }) => {
  return (
    <div className="w-full h-full overflow-hidden bg-dark">
      <video className="w-full h-full" src={makeFreshMediaUrl(src)} controls controlsList="nofullscreen" playsInline />
    </div>
  )
}
