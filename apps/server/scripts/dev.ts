import type { ChildProcess } from 'node:child_process'

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'
import path from 'node:path'

const appRoot = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const vitePath = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js')
const backendPort = Number(process.env.OPEN_FLOW_PORT ?? '3000')
if (!Number.isInteger(backendPort) || backendPort < 1 || backendPort > 65_535) {
  throw new Error('OPEN_FLOW_PORT must be an integer between 1 and 65535 in development.')
}
const configuredOperatorToken = process.env.OPEN_FLOW_OPERATOR_TOKEN
if (configuredOperatorToken != null && Buffer.byteLength(configuredOperatorToken) < 32) {
  throw new Error('OPEN_FLOW_OPERATOR_TOKEN must contain at least 32 UTF-8 bytes. Remove it to use a generated development token.')
}
const operatorToken = configuredOperatorToken ?? randomBytes(32).toString('base64url')

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

const backend = start('node', ['--watch', '--experimental-transform-types', '--disable-warning=ExperimentalWarning', '--no-node-snapshot', 'node/main.ts'], {
  ...process.env,
  OPEN_FLOW_HOST: '127.0.0.1',
  OPEN_FLOW_OPERATOR_TOKEN: operatorToken,
  OPEN_FLOW_PORT: String(backendPort),
})
const frontend = start(process.execPath, [vitePath, '--host', '127.0.0.1', '--clearScreen', 'false', ...process.argv.slice(2)], {
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
