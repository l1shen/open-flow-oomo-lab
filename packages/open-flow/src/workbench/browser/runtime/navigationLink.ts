import type { MouseEvent } from 'react'

export function followWorkbenchLink(event: MouseEvent<Element>, navigate: () => void): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate()
}
