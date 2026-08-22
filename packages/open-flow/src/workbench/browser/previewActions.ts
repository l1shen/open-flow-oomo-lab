import type { WidgetAction } from '../../designer/browser/stores/node/constants.ts'

import { normalizePreviewPayload } from '../../base/common/preview.ts'
import { formatPreviewText } from '../../designer/browser/preview/textPreview.tsx'

function fileBaseName(id: string | undefined, type: string): string {
  return (id || `preview-${type}`).replaceAll(/[^a-zA-Z0-9._-]+/g, '-')
}

function mediaSource(data: string, mediaType: 'audio' | 'image' | 'video'): string {
  if (data.startsWith('/') || data.startsWith('http:') || data.startsWith('https:') || data.startsWith('blob:') || data.startsWith('data:')) return data
  const mimeType = mediaType == 'image' ? 'image/png' : mediaType == 'video' ? 'video/mp4' : 'audio/mpeg'
  return `data:${mimeType};base64,${data}`
}

function openUrl(url: string): void {
  if (!isBrowserUrl(url)) return
  window.open(url, '_blank', 'noopener')
}

function downloadUrl(url: string, name: string): void {
  if (!isBrowserUrl(url)) return
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  link.click()
}

function isBrowserUrl(url: string): boolean {
  if (url.startsWith('/')) return true
  try {
    const protocol = new URL(url, window.location.href).protocol
    return protocol == 'http:' || protocol == 'https:' || protocol == 'blob:' || protocol == 'data:'
  } catch {
    return false
  }
}

function withBlob(content: string, mimeType: string, use: (url: string) => void): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }))
  use(url)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function rawActions(content: string, mimeType: string, name: string): WidgetAction[] {
  return [
    {
      type: 'download',
      onClick: () => withBlob(content, mimeType, (url) => downloadUrl(url, name)),
    },
    {
      type: 'openInNewTab',
      onClick: () => withBlob(content, mimeType, openUrl),
    },
  ]
}

function sourceActions(source: string, name: string): WidgetAction[] {
  return [
    { type: 'download', onClick: () => downloadUrl(source, name) },
    { type: 'openInNewTab', onClick: () => openUrl(source) },
  ]
}

function imageActions(data: string | readonly string[], id: string | undefined): WidgetAction[] {
  const sources = (typeof data == 'string' ? [data] : data).map((source) => mediaSource(source, 'image'))
  const baseName = fileBaseName(id, 'image')
  return [
    {
      type: 'download',
      onClick: () => sources.forEach((source, index) => downloadUrl(source, `${baseName}${sources.length > 1 ? `-${index + 1}` : ''}.png`)),
    },
    {
      type: 'openInNewTab',
      onClick: () => {
        if (sources.length == 1) {
          openUrl(sources[0])
        } else {
          const tab = window.open('about:blank', '_blank')
          if (tab) {
            tab.opener = null
            tab.document.title = baseName
            tab.document.body.style.cssText = 'display:grid;gap:8px;margin:8px;background:#111'
            for (const source of sources) {
              const image = tab.document.createElement('img')
              image.src = source
              image.style.cssText = 'display:block;max-width:100%;margin:auto'
              tab.document.body.appendChild(image)
            }
          }
        }
      },
    },
  ]
}

export function createPreviewActions(value: unknown, id: string | undefined): WidgetAction[] {
  let payload
  try {
    payload = normalizePreviewPayload(value)
  } catch {
    return []
  }
  const baseName = fileBaseName(id, payload.type)
  if (payload.type == 'image') return imageActions(payload.data, id)
  if (payload.type == 'video' || payload.type == 'audio') {
    const extension = payload.type == 'video' ? 'mp4' : 'mp3'
    return sourceActions(mediaSource(payload.data, payload.type), `${baseName}.${extension}`)
  }
  if (payload.type == 'iframe') return [{ type: 'openInNewTab', onClick: () => openUrl(payload.data) }]
  if (payload.type == 'markdown') return rawActions(payload.data, 'text/markdown', `${baseName}.md`)
  if (payload.type == 'html') return rawActions(payload.data, 'text/html', `${baseName}.html`)
  if (payload.type == 'csv') return sourceActions(payload.data, `${baseName}.csv`)
  if (payload.type == 'table' && typeof payload.data == 'string') return sourceActions(payload.data, `${baseName}.csv`)
  if (payload.type == 'table') return rawActions(formatPreviewText(payload.data), 'application/json', `${baseName}.json`)
  const extension = payload.type == 'json' ? 'json' : 'txt'
  const mimeType = payload.type == 'json' ? 'application/json' : payload.type == 'text' ? 'text/plain' : payload.type
  return rawActions(formatPreviewText(payload.data), mimeType, `${baseName}.${extension}`)
}
