import type { ConnectorProxyRequest, ConnectorProxyResult } from '@oomol-lab/open-flow/connector-proxy'
import type { ConnectorAction, ConnectorConnection, ConnectorProvider } from '@oomol-lab/open-flow/control-api'
import type { JsonValue } from '@oomol-lab/open-flow/project-change'

export interface ConnectorHost {
  execute(action: string, connectionId: string, input: Readonly<Record<string, JsonValue>>, invocationId: string, signal: AbortSignal): Promise<JsonValue>
  getAction(actionId: string, signal?: AbortSignal): Promise<ConnectorAction>
  listActions(serviceId?: string, signal?: AbortSignal): Promise<readonly ConnectorAction[]>
  listConnections(serviceId: string, signal?: AbortSignal): Promise<readonly ConnectorConnection[]>
  listProviders(signal?: AbortSignal): Promise<readonly ConnectorProvider[]>
  proxy(provider: string, connectionId: string, rateLimitId: string, request: ConnectorProxyRequest, signal: AbortSignal): Promise<ConnectorProxyResult>
  ready(): Promise<boolean>
  searchActions(query: string, signal?: AbortSignal): Promise<readonly ConnectorAction[]>
}

export class ConnectorTaskError extends Error {
  constructor(
    readonly code: 'connector.action-not-found' | 'connector.connection-required' | 'connector.unavailable',
    message: string,
  ) {
    super(message)
    this.name = 'ConnectorTaskError'
  }
}
