import type { ReadonlyVal, Val } from 'value-enhancer'
import type { ConnectorCatalog } from '../../../../connector/common/catalog.ts'
import type { ConnectorConnection } from '../../../../connector/common/model.ts'

import { val } from 'value-enhancer'

export type ConnectorConnections = readonly ConnectorConnection[] | null | undefined

interface Entry {
  readonly connections: Val<ConnectorConnections>
  request?: Promise<void>
}

export class ConnectorConnectionStore {
  readonly #catalog: ConnectorCatalog
  readonly #entries = new Map<string, Entry>()
  readonly #request = new AbortController()

  public constructor(catalog: ConnectorCatalog) {
    this.#catalog = catalog
  }

  public connections(service: string): ReadonlyVal<ConnectorConnections> {
    return this.#entry(service).connections
  }

  public load(service: string): Promise<void> {
    const entry = this.#entry(service)
    if (entry.request != null) return entry.request
    if (entry.connections.value != null) return Promise.resolve()

    const request = this.#load(service)
      .then((connections) => entry.connections.set(connections))
      .catch((error: unknown) => {
        if (this.#request.signal.aborted) return
        console.error(`Failed to load Connector connections for "${service}".`, error)
        entry.connections.set(null)
      })
      .finally(() => {
        if (entry.request == request) entry.request = undefined
      })
    entry.request = request
    return request
  }

  public dispose(): void {
    this.#request.abort()
    this.#entries.clear()
  }

  async #load(service: string): Promise<readonly ConnectorConnection[]> {
    try {
      return await this.#catalog.listConnections(service, this.#request.signal)
    } catch {
      this.#request.signal.throwIfAborted()
      return this.#catalog.listConnections(service, this.#request.signal)
    }
  }

  #entry(service: string): Entry {
    let entry = this.#entries.get(service)
    if (entry == null) {
      entry = { connections: val<ConnectorConnections>() }
      this.#entries.set(service, entry)
    }
    return entry
  }
}
