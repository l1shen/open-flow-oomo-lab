import type { RevisionContent } from '@oomol-lab/open-flow/project-change'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { spawn } from 'node:child_process'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { afterEach, expect, it } from 'vitest'

const children = new Set<ChildProcessWithoutNullStreams>()
const directories: string[] = []
const operatorToken = 'open-flow-server-process-token-00000001'

afterEach(async () => {
  await Promise.all([...children].map(stop))
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

function hangingFlow(): RevisionContent {
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              task: {
                concurrency: 1,
                inputs: {},
                kind: 'task',
                task: { inputs: {}, moduleId: 'main', name: 'Main', outputs: {} },
              },
            },
          },
          name: 'Main',
        },
      },
      subflows: {},
      tasks: {},
    },
    modelVersion: 1,
    modules: { main: { imports: [], name: 'Main', source: 'export default async () => await new Promise(() => {})' } },
  }
}

async function start(
  dataDirectory: string,
  environment: NodeJS.ProcessEnv = {},
  releaseDirectory = path.resolve(import.meta.dirname, '../dist'),
): Promise<{ readonly child: ChildProcessWithoutNullStreams; readonly origin: string }> {
  const main = path.join(releaseDirectory, 'server/main.js')
  const child = spawn(process.execPath, ['--no-node-snapshot', main], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      OPEN_FLOW_DATA_DIR: dataDirectory,
      OPEN_FLOW_HOST: '127.0.0.1',
      OPEN_FLOW_OPERATOR_TOKEN: operatorToken,
      OPEN_FLOW_PORT: '0',
      ...environment,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  children.add(child)
  const lines = createInterface({ input: child.stdout })
  let stderr = ''
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', (chunk: string) => {
    if (stderr.length < 4_096) stderr += chunk
  })
  return await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code, signal) => {
      const detail = stderr.trim()
      reject(new Error(`Server exited during startup (${signal ?? code ?? 'unknown'}${detail.length == 0 ? '' : `: ${detail}`}).`))
    })
    lines.once('line', (line) => {
      const message = JSON.parse(line) as { readonly category: string; readonly port: number; readonly service: string; readonly type: string }
      if (message.type != 'listening' || message.category != 'process.started' || message.service != 'open-flow-server') {
        reject(new Error('Server did not report its listening address.'))
      } else resolve({ child, origin: `http://127.0.0.1:${message.port}` })
    })
  })
}

async function stop(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode == null && child.signalCode == null) {
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()))
    child.kill('SIGKILL')
    await closed
  }
  children.delete(child)
}

async function terminate(child: ChildProcessWithoutNullStreams): Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }> {
  const closed = new Promise<{ readonly code: number | null; readonly signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }))
  })
  child.kill('SIGTERM')
  const result = await closed
  children.delete(child)
  return result
}

async function json<Body>(response: Response): Promise<Body> {
  const body = (await response.json()) as Body
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`)
  return body
}

async function operatorCookie(origin: string, token = operatorToken): Promise<string> {
  const response = await fetch(`${origin}/auth/session`, {
    body: JSON.stringify({ token, version: 1 }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) throw new Error(`Operator login failed with HTTP ${response.status}.`)
  return response.headers.get('set-cookie')!.split(';', 1)[0]!
}

async function waitForRunning(origin: string, runId: string, cookie: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = await json<{ readonly status: string }>(await fetch(`${origin}/v1/runs/${runId}`, { headers: { cookie } }))
    const events = await json<{ readonly events: readonly { readonly kind: string }[] }>(
      await fetch(`${origin}/v1/runs/${runId}/events`, { headers: { cookie } }),
    )
    if (run.status == 'running' && events.events.some((event) => event.kind == 'node.started')) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('Run did not cross the start barrier.')
}

it('recovers a process crash after the start barrier as one indeterminate terminal', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-server-process-'))
  directories.push(directory)
  let app = await start(directory)
  const cookie = await operatorCookie(app.origin)
  const accepted = await json<{ readonly runId: string }>(
    await fetch(`${app.origin}/v1/runs`, {
      body: JSON.stringify({ flowId: 'main', idempotencyKey: 'crash', revision: hangingFlow(), revisionId: 'revision-crash' }),
      headers: { 'content-type': 'application/json', cookie },
      method: 'POST',
    }),
  )
  await waitForRunning(app.origin, accepted.runId, cookie)
  await stop(app.child)

  app = await start(directory)
  const run = await json<{ readonly status: string }>(await fetch(`${app.origin}/v1/runs/${accepted.runId}`, { headers: { cookie } }))
  const events = await json<{ readonly events: readonly { readonly kind: string }[] }>(
    await fetch(`${app.origin}/v1/runs/${accepted.runId}/events`, { headers: { cookie } }),
  )
  expect(run.status).toBe('indeterminate')
  expect(events.events.filter((event) => ['run.canceled', 'run.completed', 'run.failed', 'run.indeterminate'].includes(event.kind))).toEqual([
    { cursor: expect.any(Number), kind: 'run.indeterminate', payload: expect.any(Object) },
  ])
  await stop(app.child)
})

it('closes the HTTP server and SQLite store on SIGTERM', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-server-process-'))
  directories.push(directory)
  let app = await start(directory)

  await expect(terminate(app.child)).resolves.toEqual({ code: 0, signal: null })

  app = await start(directory)
  await expect(json(await fetch(`${app.origin}/healthz`))).resolves.toEqual({ status: 'ok' })
  await expect(json(await fetch(`${app.origin}/readyz`))).resolves.toEqual({ status: 'ready' })
  await stop(app.child)
})

it('serves the compiled Workbench and authenticates the Control API in the real process', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-server-process-'))
  const releaseDirectory = await mkdtemp(path.join(tmpdir(), 'open-flow-server-release-'))
  directories.push(directory, releaseDirectory)
  await cp(path.resolve(import.meta.dirname, '../dist'), releaseDirectory, { recursive: true })
  const app = await start(directory, {}, releaseDirectory)

  await expect(json(await fetch(`${app.origin}/healthz`))).resolves.toEqual({ status: 'ok' })
  const index = await fetch(app.origin, { headers: { accept: 'text/html' } })
  expect(index.status).toBe(200)
  expect(index.headers.get('cache-control')).toBe('no-cache')
  const html = await index.text()
  expect(html).toContain('<title>Open Flow Server</title>')
  const assetPath = html.match(/(?:href|src)="(\/assets\/[^"]+)"/)?.[1]
  expect(assetPath).toBeDefined()
  const asset = await fetch(`${app.origin}${assetPath}`)
  expect(asset.status).toBe(200)
  expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')

  await expect(json(await fetch(`${app.origin}/auth/session`))).resolves.toEqual({ authenticated: false, configured: true, version: 1 })
  const cookie = await operatorCookie(app.origin)
  const projects = await fetch(`${app.origin}/v1/projects`, { headers: { cookie } })
  expect(projects.status).toBe(200)
  await expect(projects.json()).resolves.toMatchObject({ projects: [], version: 1 })
  await expect(terminate(app.child)).resolves.toEqual({ code: 0, signal: null })
})
