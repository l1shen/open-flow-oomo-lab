import { serve } from '@hono/node-server'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ConnectorClient } from './connector.ts'
import { createServerApp } from './http.ts'
import { createLogger } from './logger.ts'
import { OperatorSession } from './operator.ts'
import { ServerService } from './service.ts'

const logger = createLogger()

await main().catch((error: unknown) => {
  logger.fatal({ category: 'process.start.failed', err: error }, 'Server failed to start.')
  logger.flush()
  process.exitCode = 1
})

async function main(): Promise<void> {
  const host = process.env.OPEN_FLOW_HOST ?? '127.0.0.1'
  const port = Number(process.env.OPEN_FLOW_PORT ?? '3000')
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('OPEN_FLOW_PORT must be an integer between 0 and 65535.')
  const dataDirectory = path.resolve(process.env.OPEN_FLOW_DATA_DIR ?? '.open-flow-dev/server')
  await mkdir(dataDirectory, { recursive: true })

  const retentionDays = Number(process.env.OPEN_FLOW_RUN_EVENT_RETENTION_DAYS ?? '30')
  const runEventRetentionMs = retentionDays * 24 * 60 * 60 * 1000
  if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0 || !Number.isSafeInteger(runEventRetentionMs)) {
    throw new Error('OPEN_FLOW_RUN_EVENT_RETENTION_DAYS must be a positive safe integer number of days.')
  }

  const connectorOrigin = process.env.OPEN_FLOW_CONNECTOR_ORIGIN
  const connectorToken = process.env.OPEN_FLOW_CONNECTOR_TOKEN
  const connectorConsoleOrigin = process.env.OPEN_FLOW_CONNECTOR_CONSOLE_ORIGIN
  if ((connectorOrigin == null) != (connectorToken == null)) {
    throw new Error('OPEN_FLOW_CONNECTOR_ORIGIN and OPEN_FLOW_CONNECTOR_TOKEN must be configured together.')
  }
  const connector = connectorOrigin == null || connectorToken == null ? undefined : new ConnectorClient(connectorOrigin, connectorToken, 30_000, logger)

  const integrationPublicOrigin = process.env.OPEN_FLOW_INTEGRATION_PUBLIC_ORIGIN
  const integrationCallbackKey = process.env.OPEN_FLOW_INTEGRATION_CALLBACK_KEY
  if ((integrationPublicOrigin == null) != (integrationCallbackKey == null)) {
    throw new Error('OPEN_FLOW_INTEGRATION_PUBLIC_ORIGIN and OPEN_FLOW_INTEGRATION_CALLBACK_KEY must be configured together.')
  }
  let integration: { readonly callbackKey: string; readonly publicOrigin: string } | undefined
  if (integrationPublicOrigin != null && integrationCallbackKey != null) {
    const publicOrigin = new URL(integrationPublicOrigin)
    if (
      (publicOrigin.protocol != 'http:' && publicOrigin.protocol != 'https:') ||
      publicOrigin.username != '' ||
      publicOrigin.password != '' ||
      publicOrigin.pathname != '/' ||
      publicOrigin.search != '' ||
      publicOrigin.hash != ''
    ) {
      throw new Error('OPEN_FLOW_INTEGRATION_PUBLIC_ORIGIN must be an HTTP origin without credentials, a path, query, or fragment.')
    }
    if (Buffer.byteLength(integrationCallbackKey) < 32) {
      throw new Error('OPEN_FLOW_INTEGRATION_CALLBACK_KEY must contain at least 32 UTF-8 bytes.')
    }
    integration = { callbackKey: integrationCallbackKey, publicOrigin: publicOrigin.origin }
  }
  const operatorToken = process.env.OPEN_FLOW_OPERATOR_TOKEN
  const secureCookie = process.env.OPEN_FLOW_SESSION_COOKIE_SECURE
  if (secureCookie != null && secureCookie != 'true' && secureCookie != 'false') {
    throw new Error('OPEN_FLOW_SESSION_COOKIE_SECURE must be true or false.')
  }
  const operator = operatorToken == null ? undefined : new OperatorSession(operatorToken, secureCookie == 'true')
  const service = ServerService.open(
    path.join(dataDirectory, 'open-flow.sqlite'),
    connector,
    Date.now,
    { ...(integration == null ? {} : { integration }), runEventRetentionMs },
    connectorConsoleOrigin,
    logger,
  )
  service.start()
  const workbenchHost = process.argv.includes('--api-only') ? {} : { publicDirectory: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public') }
  let closing = false
  const server = serve(
    {
      fetch: createServerApp(service, { logger, operator, ...workbenchHost }).fetch,
      hostname: host,
      overrideGlobalObjects: false,
      port,
    },
    (address) => {
      process.once('SIGINT', interrupt)
      process.once('SIGTERM', terminate)
      logger.info({ category: 'process.started', host, port: address.port, type: 'listening' }, 'Server is listening.')
    },
  )

  function interrupt(): void {
    shutdown('SIGINT')
  }

  function terminate(): void {
    shutdown('SIGTERM')
  }

  function shutdown(signal: NodeJS.Signals): void {
    if (closing) return
    closing = true
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
    logger.info({ category: 'process.stopping', signal }, 'Server is stopping.')
    void close()
      .then(() => {
        logger.info({ category: 'process.stopped', signal }, 'Server stopped.')
        logger.flush()
      })
      .catch((error: unknown) => {
        logger.error({ category: 'process.stop.failed', err: error, signal }, 'Server failed to stop.')
        logger.flush()
        process.exitCode = 1
      })
  }

  async function close(): Promise<void> {
    await new Promise<void>((resolve, reject) => server.close((error) => (error == null ? resolve() : reject(error))))
    await service.close()
  }
}
