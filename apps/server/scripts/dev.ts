import type { ChildProcess } from 'node:child_process'

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import path from 'node:path'

const appRoot = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const vitePath = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const backendPort = Number(process.env.OPEN_FLOW_PORT ?? '3000')
if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65_535) {
  throw new Error('OPEN_FLOW_PORT must be an integer between 1 and 65535 in development.')
}
const configuredOperatorToken = process.env.OPEN_FLOW_TOKEN
if (configuredOperatorToken != null && Buffer.byteLength(configuredOperatorToken) < 32) {
  throw new Error('OPEN_FLOW_TOKEN must contain at least 32 UTF-8 bytes. Remove it to use a generated development token.')
}
const operatorToken = configuredOperatorToken ?? randomBytes(32).toString('base64url')

if (!(await portAvailable(backendPort))) {
  process.stderr.write(`Server API port ${backendPort} is already in use. Stop the existing process or set OPEN_FLOW_PORT.\n`)
  process.exit(1)
}

process.stdout.write(
  `Development endpoints:\n  Workbench: http://127.0.0.1:5173 (or the Local URL reported by Vite)\n  Server API: http://127.0.0.1:${backendPort}\n`,
)

function start(command: string, args: readonly string[], environment = process.env): ChildProcess {
  return spawn(command, [...args], { cwd: appRoot, env: environment, stdio: 'inherit' })
}

function completed(child: ChildProcess, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code == 0) resolve()
      else reject(new Error(`${name} exited with ${signal ?? `code ${code ?? 'unknown'}`}.`))
    })
  })
}

const backend = start(
  'node',
  ['--watch', '--experimental-transform-types', '--disable-warning=ExperimentalWarning', '--no-node-snapshot', 'node/main.ts', '--api-only'],
  {
    ...process.env,
    OPEN_FLOW_HOST: '127.0.0.1',
    OPEN_FLOW_TOKEN: operatorToken,
    OPEN_FLOW_PORT: String(backendPort),
  },
)
const frontend = start(process.execPath, [vitePath, '--host', '127.0.0.1', '--clearScreen', 'false', '--strictPort', ...process.argv.slice(2)], {
  ...process.env,
  OPEN_FLOW_DEV_API_ORIGIN: `http://127.0.0.1:${backendPort}`,
})
const backendResult = completed(backend, 'Server backend')
const frontendResult = completed(frontend, 'Server frontend')
let interrupted = false

if (configuredOperatorToken == null) process.stdout.write(`Server operator token: ${operatorToken}\n`)

function stop(): void {
  interrupted = true
  backend.kill('SIGTERM')
  frontend.kill('SIGTERM')
}

process.once('SIGINT', stop)
process.once('SIGTERM', stop)

try {
  await Promise.race([backendResult, frontendResult])
} catch (error) {
  if (!interrupted) throw error
} finally {
  process.removeListener('SIGINT', stop)
  process.removeListener('SIGTERM', stop)
  backend.kill('SIGTERM')
  frontend.kill('SIGTERM')
  await Promise.allSettled([backendResult, frontendResult])
}

async function portAvailable(port: number): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const probe = createServer()
    probe.once('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close((error) => resolve(error == null)))
  })
}
