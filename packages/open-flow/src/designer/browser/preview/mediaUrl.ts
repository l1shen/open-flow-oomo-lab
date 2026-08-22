export function makeFreshMediaUrl(src: string): string {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) return src

  const fragmentIndex = src.indexOf('#')
  const url = fragmentIndex < 0 ? src : src.slice(0, fragmentIndex)
  const fragment = fragmentIndex < 0 ? '' : src.slice(fragmentIndex)
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${Date.now()}${fragment}`
}
