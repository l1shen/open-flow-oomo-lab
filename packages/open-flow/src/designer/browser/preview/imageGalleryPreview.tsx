import 'viewerjs/dist/viewer.css'
import styles from './imageGalleryPreview.module.scss'

import { useEffect, useMemo, useRef, useState } from 'react'
import Viewer from 'viewerjs'
import { makeFreshMediaUrl } from './mediaUrl.ts'

export interface ImageGalleryPreviewProps {
  images: string[]
  lite?: boolean
}

export const ImageGalleryPreview = ({ images, lite = false }: ImageGalleryPreviewProps): JSX.Element | null => {
  const [loading, setLoading] = useState(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const imagesRef = useRef<HTMLDivElement>(null)
  const mediaUrls = useMemo(() => images.map(makeFreshMediaUrl), [images])

  useEffect(() => {
    if (mediaUrls.length > 0 && imagesRef.current && containerRef.current) {
      setLoading(true)
      const gallery = new Viewer(imagesRef.current, {
        loading: true,
        inline: true,
        transition: false,
        fullscreen: false,
        title: false,
        toolbar: !lite,
        zoomOnWheel: !lite,
        zoomOnTouch: !lite,
        toggleOnDblclick: !lite,
        movable: !lite,
        rotatable: !lite,
        zoomable: !lite,
        scalable: !lite,
        navbar: mediaUrls.length > 1,
        ready() {
          setLoading(false)
          gallery.show()
        },
      })

      const observer = new ResizeObserver(() => {
        ;(gallery as any).resize?.()
      })
      observer.observe(containerRef.current)

      return () => {
        observer.disconnect()
        gallery.destroy()
      }
    } else {
      setLoading(false)
    }
  }, [mediaUrls, lite])

  if (mediaUrls.length <= 0) {
    return null
  }

  return (
    <div ref={containerRef} className={styles.container}>
      {loading && <div className="viewer-loading" />}
      <div ref={imagesRef} className="absolute invisible">
        {mediaUrls.map((mediaUrl, i) => (
          <img alt="" key={i} src={mediaUrl} />
        ))}
      </div>
    </div>
  )
}
