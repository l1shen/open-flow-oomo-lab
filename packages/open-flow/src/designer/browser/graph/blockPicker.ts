import { useCallback, useEffect, useMemo, useState } from 'react'

export interface BlockPickerItem {
  readonly description?: string
  readonly detail?: string
  readonly disabled?: boolean
  readonly index?: number
  readonly label: string
  readonly type: string
}

export type IndexedBlockPickerItem<T extends BlockPickerItem> = T & { readonly index: number }

export function filterBlockPickerItems<T extends BlockPickerItem>(searchTerm: string, items: readonly T[]): IndexedBlockPickerItem<T>[] {
  const query = searchTerm.trim().toLowerCase()
  if (query == '') return items.map((item, index) => ({ ...item, index: item.index ?? index }))

  const result: IndexedBlockPickerItem<T>[] = []
  let divider: IndexedBlockPickerItem<T> | undefined
  let group: IndexedBlockPickerItem<T>[] = []
  let includeGroup = false
  const flush = (): void => {
    if (group.length == 0) return
    if (divider != null) result.push(divider)
    result.push(...group)
    group = []
  }

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!
    if (item.type == 'divider') {
      flush()
      divider = { ...item, index: item.index ?? index }
      includeGroup = item.label.toLowerCase().includes(query) || (item.detail?.toLowerCase().includes(query) ?? false)
      continue
    }
    if (
      includeGroup ||
      item.label.toLowerCase().includes(query) ||
      (item.detail?.toLowerCase().includes(query) ?? false) ||
      (item.description?.toLowerCase().includes(query) ?? false)
    ) {
      group.push({ ...item, index: item.index ?? index })
    }
  }
  flush()
  return result
}

export function mergeBlockPickerItems<T extends BlockPickerItem>(
  items: readonly IndexedBlockPickerItem<T>[],
  additions: readonly IndexedBlockPickerItem<T>[],
): IndexedBlockPickerItem<T>[] {
  const result = [...items]
  for (let index = 0; index < additions.length;) {
    const item = additions[index]!
    if (item.type != 'divider') {
      result.push(item)
      index++
      continue
    }
    let end = index + 1
    while (end < additions.length && additions[end]!.type != 'divider') end++
    const existing = result.findIndex((candidate) => candidate.type == 'divider' && candidate.label == item.label)
    if (existing < 0) {
      result.push(...additions.slice(index, end))
    } else {
      let insertion = existing + 1
      while (insertion < result.length && result[insertion]!.type != 'divider') insertion++
      result.splice(insertion, 0, ...additions.slice(index + 1, end))
    }
    index = end
  }
  return result
}

export function useBlockPickerItems<T extends BlockPickerItem>(
  items: readonly T[],
  searchTerm: string,
  provideAsyncItems?: (searchTerm: string, signal: AbortSignal) => Promise<readonly T[] | undefined>,
): {
  readonly error: boolean
  readonly items: readonly IndexedBlockPickerItem<T>[]
  readonly loading: boolean
  readonly retry: () => void
} {
  const [asyncItems, setAsyncItems] = useState<readonly T[]>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [retryRequest, setRetryRequest] = useState(0)
  const localItems = useMemo(() => filterBlockPickerItems(searchTerm, items), [items, searchTerm])
  const mergedItems = useMemo(
    () =>
      mergeBlockPickerItems(
        localItems,
        asyncItems.map((item, index) => ({ ...item, index: items.length + index })),
      ),
    [asyncItems, items.length, localItems],
  )

  useEffect(() => {
    const query = searchTerm.trim()
    if (provideAsyncItems == null) {
      setAsyncItems([])
      setError(false)
      setLoading(false)
      return
    }
    setAsyncItems([])
    setError(false)
    setLoading(false)
    const controller = new AbortController()
    let loadingTimer: ReturnType<typeof setTimeout> | undefined
    const requestTimer = setTimeout(
      () => {
        loadingTimer = setTimeout(() => {
          if (!controller.signal.aborted) setLoading(true)
        }, 150)
        void provideAsyncItems(query, controller.signal)
          .then((nextItems) => {
            if (!controller.signal.aborted) setAsyncItems(nextItems ?? [])
          })
          .catch(() => {
            if (!controller.signal.aborted) setError(true)
          })
          .finally(() => {
            clearTimeout(loadingTimer)
            if (!controller.signal.aborted) setLoading(false)
          })
      },
      query.length == 0 ? 0 : 300,
    )
    return () => {
      clearTimeout(requestTimer)
      clearTimeout(loadingTimer)
      controller.abort()
    }
  }, [provideAsyncItems, retryRequest, searchTerm])

  return {
    error,
    items: mergedItems,
    loading,
    retry: useCallback(() => setRetryRequest((value) => value + 1), []),
  }
}
