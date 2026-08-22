import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ImageGalleryPreview } from '../../src/designer/browser/preview/imageGalleryPreview.tsx'
import { makeFreshMediaUrl } from '../../src/designer/browser/preview/mediaUrl.ts'
import { VideoPreview } from '../../src/designer/browser/preview/videoPreview.tsx'

describe('Direct media previews', () => {
  it('preserves self-contained media URLs', () => {
    expect(makeFreshMediaUrl('data:video/mp4;base64,AAAA')).toBe('data:video/mp4;base64,AAAA')
    expect(makeFreshMediaUrl('blob:https://example.test/id')).toBe('blob:https://example.test/id')
  })

  it('cache-busts direct URLs without moving their fragment', () => {
    vi.spyOn(Date, 'now').mockReturnValue(42)

    expect(makeFreshMediaUrl('file:///tmp/demo.mp4')).toBe('file:///tmp/demo.mp4?t=42')
    expect(makeFreshMediaUrl('https://example.test/demo.mp4?quality=high#t=3')).toBe('https://example.test/demo.mp4?quality=high&t=42#t=3')
  })

  it('uses the native video element for direct media sources', () => {
    const markup = renderToStaticMarkup(<VideoPreview src="blob:https://example.test/id" />)

    expect(markup).toContain('<video')
    expect(markup).toContain('src="blob:https://example.test/id"')
    expect(markup).toContain('controls=""')
  })

  it('keeps every image available to the gallery viewer', () => {
    const markup = renderToStaticMarkup(<ImageGalleryPreview images={['/one.png', '/two.png']} lite />)

    expect(markup).toContain('/one.png')
    expect(markup).toContain('/two.png')
    expect(markup).toContain('viewer-loading')
  })
})
