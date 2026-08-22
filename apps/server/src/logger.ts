import type { DestinationStream, Level, Logger } from 'pino'

import pino from 'pino'

const levels: ReadonlySet<string> = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])
const redacted = '[Redacted]'
const redactPaths = ['authorization', 'cookie', 'credential', 'password', 'token', '*.authorization', '*.cookie', '*.credential', '*.password', '*.token']

export const silentLogger = pino({ enabled: false })

export function createLogger(level = process.env.OPEN_FLOW_LOG_LEVEL ?? 'info', destination?: DestinationStream): Logger {
  if (!levels.has(level)) throw new Error('OPEN_FLOW_LOG_LEVEL must be a Pino log level.')
  return pino(
    {
      base: { service: 'open-flow-server' },
      level: level as Level,
      redact: { censor: redacted, paths: redactPaths },
    },
    destination ??
      pino.multistream(
        [
          { level: 'trace', stream: pino.destination(1) },
          { level: 'error', stream: pino.destination(2) },
        ],
        { dedupe: true },
      ),
  )
}

export function errorKind(error: unknown): Readonly<Record<string, string>> {
  if (!(error instanceof Error)) return { errorType: typeof error }
  const code = 'code' in error && typeof error.code == 'string' ? error.code : undefined
  return { ...(code == null ? {} : { errorCode: code }), errorType: error.name }
}
