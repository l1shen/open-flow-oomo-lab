import type { RevisionContent } from '@oomol-lab/open-flow/project-change'

import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const workspaceRoot = path.resolve(import.meta.dirname, '../../..')
const suffix = randomUUID().replaceAll('-', '')
const imageName = `open-flow-server:smoke-${suffix}`
const volumeName = `open-flow-server-smoke-${suffix}`
const firstContainer = `open-flow-server-smoke-first-${suffix}`
const secondContainer = `open-flow-server-smoke-second-${suffix}`
const operatorToken = 'open-flow-server-docker-smoke-token'
const containers = [firstContainer, secondContainer]
let imageBuilt = false
let volumeCreated = false

try {
  process.stdout.write('Building the Server Docker image.\n')
  await docker(['build', '--file', 'apps/server/Dockerfile', '--tag', imageName, '.'])
  imageBuilt = true
  assert.equal((await docker(['image', 'inspect', '--format', '{{.Config.User}}', imageName])).trim(), 'node')

  await docker(['volume', 'create', volumeName])
  volumeCreated = true

  process.stdout.write('Starting the first container and exercising the runtime.\n')
  await startContainer(firstContainer)
  await waitForHealthy(firstContainer)
  const firstOrigin = await containerOrigin(firstContainer)
  const firstCookie = await login(firstOrigin)

  const index = await fetch(firstOrigin, { headers: { accept: 'text/html' } })
  assert.equal(index.status, 200)
  assert.match(await index.text(), /<title>Open Flow Server<\/title>/)

  const project = await requestJson<{ readonly draftRevisionId: string; readonly projectId: string }>(
    firstOrigin,
    '/v1/projects',
    {
      body: JSON.stringify({ name: 'Docker smoke project', version: 1 }),
      headers: { 'content-type': 'application/json', 'cookie': firstCookie, 'idempotency-key': `project-${suffix}` },
      method: 'POST',
    },
    201,
  )
  const revision = codeFlow()
  const changed = await requestJson<{ readonly revision: { readonly revisionId: string } }>(
    firstOrigin,
    `/v1/projects/${project.projectId}/draft/changes`,
    {
      body: JSON.stringify({
        expectedRevisionId: project.draftRevisionId,
        operations: [
          { kind: 'module.create', module: revision.modules.code, moduleId: 'code' },
          { flow: revision.document.flows.main, flowId: 'main', kind: 'flow.create' },
        ],
        version: 1,
      }),
      headers: { 'content-type': 'application/json', 'cookie': firstCookie },
      method: 'POST',
    },
    200,
  )
  const publication = await requestJson<{ readonly publicationId: string }>(
    firstOrigin,
    `/v1/projects/${project.projectId}/revisions/${changed.revision.revisionId}/flows/main/publications`,
    {
      body: JSON.stringify({ engineContract: 'open-flow-engine/v1', expectedLivePublicationId: null, version: 1 }),
      headers: { 'content-type': 'application/json', 'cookie': firstCookie, 'idempotency-key': `publication-${suffix}` },
      method: 'POST',
    },
    201,
  )
  const accepted = await requestJson<{ readonly runId: string }>(
    firstOrigin,
    '/v1/runs',
    {
      body: JSON.stringify({ inputs: {}, publicationId: publication.publicationId, version: 1 }),
      headers: { 'content-type': 'application/json', 'cookie': firstCookie, 'idempotency-key': `run-${suffix}` },
      method: 'POST',
    },
    202,
  )
  const run = await waitForRun(firstOrigin, accepted.runId, firstCookie)
  assert.equal(run.status, 'completed')
  const events = await requestJson<{
    readonly events: readonly { readonly kind: string; readonly payload: Record<string, unknown>; readonly value?: unknown }[]
  }>(firstOrigin, `/v1/runs/${accepted.runId}/events`, { headers: { cookie: firstCookie } }, 200)
  const output = events.events.find((event) => event.kind == 'node.output')
  assert.equal(output?.payload.handle, 'result')
  assert.deepEqual(output?.payload.output, { kind: 'inline', value: 42 })

  await stopContainer(firstContainer)
  await docker(['rm', firstContainer])

  process.stdout.write('Restarting from the same volume and checking persisted state.\n')
  await startContainer(secondContainer)
  await waitForHealthy(secondContainer)
  const secondOrigin = await containerOrigin(secondContainer)
  const secondCookie = await login(secondOrigin)
  const projects = await requestJson<{ readonly projects: readonly { readonly projectId: string }[] }>(
    secondOrigin,
    '/v1/projects',
    { headers: { cookie: secondCookie } },
    200,
  )
  assert.ok(projects.projects.some((candidate) => candidate.projectId == project.projectId))
  const restoredRun = await requestJson<{ readonly runId: string; readonly status: string }>(
    secondOrigin,
    `/v1/runs/${accepted.runId}`,
    { headers: { cookie: secondCookie } },
    200,
  )
  assert.equal(restoredRun.runId, accepted.runId)
  assert.equal(restoredRun.status, 'completed')
  await stopContainer(secondContainer)

  process.stdout.write('Verified the Server image, Workbench, Isolated VM, graceful shutdown, and SQLite volume persistence.\n')
} catch (error) {
  for (const container of containers) {
    const logs = await docker(['logs', container]).catch(() => '')
    if (logs.trim().length > 0) process.stderr.write(`\n${container} logs:\n${logs}`)
  }
  throw error
} finally {
  for (const container of containers) await docker(['rm', '--force', container]).catch(() => undefined)
  if (volumeCreated) await docker(['volume', 'rm', volumeName]).catch(() => undefined)
  if (imageBuilt) await docker(['image', 'rm', imageName]).catch(() => undefined)
}

function codeFlow(): RevisionContent {
  const result = { jsonSchema: { type: 'number' }, nullable: false }
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              code: {
                concurrency: 1,
                inputs: {},
                kind: 'task',
                task: { inputs: {}, moduleId: 'code', name: 'Code', outputs: { result } },
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
    modules: { code: { imports: [], name: 'Code', source: 'export default () => ({ result: 42 })' } },
  }
}

async function docker(args: readonly string[]): Promise<string> {
  const result = await execFileAsync('docker', [...args], { cwd: workspaceRoot, maxBuffer: 32 * 1024 * 1024 })
  return result.stdout
}

async function startContainer(name: string): Promise<void> {
  await docker([
    'run',
    '--detach',
    '--env',
    `OPEN_FLOW_TOKEN=${operatorToken}`,
    '--name',
    name,
    '--publish',
    '127.0.0.1::3000',
    '--volume',
    `${volumeName}:/data/open-flow`,
    imageName,
  ])
}

async function waitForHealthy(name: string): Promise<void> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const state = (await docker(['inspect', '--format', '{{.State.Status}} {{.State.Health.Status}}', name])).trim()
    if (state == 'running healthy') return
    if (state.startsWith('exited') || state.startsWith('dead')) throw new Error(`${name} stopped before becoming healthy.`)
    await delay(500)
  }
  throw new Error(`${name} did not become healthy.`)
}

async function containerOrigin(name: string): Promise<string> {
  const address = (await docker(['port', name, '3000/tcp'])).trim().split('\n', 1)[0]
  assert.match(address, /^127\.0\.0\.1:\d+$/)
  return `http://${address}`
}

async function login(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/auth/session`, {
    body: JSON.stringify({ token: operatorToken, version: 1 }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie')
  assert.ok(cookie != null)
  return cookie.split(';', 1)[0]!
}

async function requestJson<Body>(baseUrl: string, pathname: string, init: RequestInit, status: number): Promise<Body> {
  const response = await fetch(`${baseUrl}${pathname}`, init)
  const source = await response.text()
  assert.equal(response.status, status, `${pathname} returned HTTP ${response.status}: ${source}`)
  return JSON.parse(source) as Body
}

async function waitForRun(baseUrl: string, runId: string, cookie: string): Promise<{ readonly status: string }> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = await requestJson<{ readonly status: string }>(baseUrl, `/v1/runs/${runId}`, { headers: { cookie } }, 200)
    if (['completed', 'failed', 'canceled', 'indeterminate'].includes(run.status)) return run
    await delay(25)
  }
  throw new Error(`Run ${runId} did not reach a terminal status.`)
}

async function stopContainer(name: string): Promise<void> {
  await docker(['stop', '--time', '15', name])
  const exitCode = (await docker(['inspect', '--format', '{{.State.ExitCode}}', name])).trim()
  assert.equal(exitCode, '0')
}
