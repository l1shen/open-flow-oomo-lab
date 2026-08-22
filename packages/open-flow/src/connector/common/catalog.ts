import type { ConnectorAction, ConnectorConnection } from './model.ts'

export interface ConnectorCatalog {
  getAction(actionId: string, signal?: AbortSignal): Promise<ConnectorAction>
  getConnectionPage(service: string, signal?: AbortSignal): Promise<string>
  listConnections(service: string, signal?: AbortSignal): Promise<readonly ConnectorConnection[]>
  searchActions(query: string, signal?: AbortSignal): Promise<readonly ConnectorAction[]>
}
