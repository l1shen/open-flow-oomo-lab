import type { ConnectorCatalog } from '../../../../connector/common/catalog.ts'
import type { ConnectorConnection } from '../../../../connector/common/model.ts'

import { describe, expect, it, vi } from 'vitest'
import { ConnectorConnectionStore } from './connectorConnection.store.ts'

const connections: readonly ConnectorConnection[] = [
  {
    displayName: 'Work Gmail',
    id: 'gmail-work',
    isDefault: true,
    service: 'gmail',
    status: 'active',
  },
]

describe('ConnectorConnectionStore', () => {
  it('shares one in-flight request and reuses the loaded service data', async () => {
    const pending = Promise.withResolvers<readonly ConnectorConnection[]>()
    const listConnections = vi.fn(() => pending.promise)
    const store = new ConnectorConnectionStore(catalog(listConnections))

    const connections$ = store.connections('gmail')
    expect(store.connections('gmail')).toBe(connections$)

    const first = store.load('gmail')
    const second = store.load('gmail')
    expect(first).toBe(second)
    expect(listConnections).toHaveBeenCalledTimes(1)

    pending.resolve(connections)
    await first

    expect(connections$.value).toBe(connections)
    await store.load('gmail')
    expect(listConnections).toHaveBeenCalledTimes(1)
    store.dispose()
  })

  it('retries one transient failure before publishing the connection list', async () => {
    const listConnections = vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValueOnce(connections)
    const store = new ConnectorConnectionStore(catalog(listConnections))

    await store.load('gmail')

    expect(listConnections).toHaveBeenCalledTimes(2)
    expect(store.connections('gmail').value).toBe(connections)
    store.dispose()
  })

  it('publishes an unavailable state after both attempts fail', async () => {
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const listConnections = vi.fn().mockRejectedValue(new Error('unavailable'))
    const store = new ConnectorConnectionStore(catalog(listConnections))

    await store.load('gmail')

    expect(listConnections).toHaveBeenCalledTimes(2)
    expect(store.connections('gmail').value).toBeNull()
    expect(logError).toHaveBeenCalledTimes(1)

    listConnections.mockResolvedValue(connections)
    await store.load('gmail')
    expect(store.connections('gmail').value).toBe(connections)

    store.dispose()
    logError.mockRestore()
  })
})

function catalog(listConnections: ConnectorCatalog['listConnections']): ConnectorCatalog {
  return {
    getAction: () => Promise.reject(new Error('Not used.')),
    getConnectionPage: () => Promise.reject(new Error('Not used.')),
    listConnections,
    searchActions: () => Promise.resolve([]),
  }
}
