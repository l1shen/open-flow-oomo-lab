import { currentEngineContract } from '@oomol-lab/open-flow/runtime-contract'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { createServerApp } from '../node/http.ts'
import { OperatorSession } from '../node/operator.ts'
import { ServerService } from '../node/service.ts'

const token = 'open-flow-server-operator-token-00000001'

it('uses a signed operator session, expires it on time or token rotation, and clears its cookie on logout', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-operator-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  let now = Date.UTC(2026, 7, 22)
  const operator = new OperatorSession(token, false, () => now)
  const app = createServerApp(service, { operator })
  try {
    const anonymous = await app.request('/auth/session')
    expect(anonymous.headers.get('cache-control')).toBe('no-store')
    expect(await anonymous.json()).toEqual({ authenticated: false, configured: true, version: 1 })

    const invalid = await app.request('/auth/session', {
      body: JSON.stringify({ token: 'wrong', version: 1 }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(invalid.status).toBe(401)
    expect(invalid.headers.get('set-cookie')).toBeNull()

    const login = await app.request('/auth/session', {
      body: JSON.stringify({ token, version: 1 }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })
    expect(login.status).toBe(200)
    const setCookie = login.headers.get('set-cookie')!
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('Max-Age=43200')
    expect(setCookie).toContain('SameSite=Strict')
    expect(setCookie).not.toContain('Secure')
    expect(setCookie).not.toContain(token)
    const cookie = setCookie.split(';', 1)[0]!

    const authenticated = await app.request('/auth/session', { headers: { cookie } })
    expect(await authenticated.json()).toEqual({ authenticated: true, configured: true, version: 1 })
    const project = await app.request('/v1/projects', {
      body: JSON.stringify({ name: 'Operator project', version: 1 }),
      headers: { 'content-type': 'application/json', cookie, 'idempotency-key': 'operator-project' },
      method: 'POST',
    })
    expect(project.status).toBe(201)
    expect((await app.request('/v1/projects')).status).toBe(401)
    expect((await app.request('/v1/projects', { headers: { authorization: `Bearer ${token}` } })).status).toBe(200)
    expect((await app.request('/v1/projects', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
    expect((await app.request('/v1/projects', { headers: { authorization: `Basic ${token}` } })).status).toBe(401)

    const rotated = createServerApp(service, {
      operator: new OperatorSession('open-flow-server-rotated-token-00000001', false, () => now),
    })
    expect(await (await rotated.request('/auth/session', { headers: { cookie } })).json()).toEqual({
      authenticated: false,
      configured: true,
      version: 1,
    })

    now += 12 * 60 * 60 * 1_000 + 1
    expect((await app.request('/v1/projects', { headers: { cookie } })).status).toBe(401)

    now = Date.UTC(2026, 7, 22)
    const logout = await app.request('/auth/session', { headers: { cookie }, method: 'DELETE' })
    expect(logout.status).toBe(204)
    expect(logout.headers.get('cache-control')).toBe('no-store')
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')

    const callback = await app.request('/v1/webhooks/not-an-endpoint', { method: 'POST' })
    expect(callback.status).toBe(404)
    expect(await callback.text()).toBe('')
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('reports missing operator configuration without disabling callbacks or health', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-operator-missing-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  const app = createServerApp(service)
  try {
    expect(await (await app.request('/auth/session')).json()).toEqual({ authenticated: false, configured: false, version: 1 })
    expect((await app.request('/auth/session', { body: JSON.stringify({ token, version: 1 }), method: 'POST' })).status).toBe(503)
    expect((await app.request('/v1/projects')).status).toBe(401)
    expect((await app.request('/v1/projects', { headers: { authorization: `Bearer ${token}` } })).status).toBe(401)
    expect((await app.request('/v1/runs/missing')).status).toBe(401)
    expect((await app.request('/healthz')).status).toBe(200)
    expect((await app.request('/v1/webhooks/not-an-endpoint')).status).toBe(404)
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('streams authenticated project invalidations without making the stream authoritative', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-notifications-'))
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  const app = createServerApp(service, { resolveControlActor: () => 'operator' })
  try {
    const created = await service.control.createProject('operator', 'Notifications', 'notifications-project')
    expect((await createServerApp(service).request(`/v1/projects/${created.project.projectId}/notifications`)).status).toBe(401)

    const response = await app.request(`/v1/projects/${created.project.projectId}/notifications`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    expect(response.headers.get('cache-control')).toBe('no-cache')
    const reader = response.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe(': connected\n\n')

    const changed = await service.control.changeDraft('operator', created.project.projectId, created.project.draftRevisionId, [
      { flow: { graph: { nodes: {} }, name: 'Main' }, flowId: 'main', kind: 'flow.create' },
    ])
    const notification = await reader.read()
    expect(new TextDecoder().decode(notification.value)).toBe(
      `data: ${JSON.stringify({ kind: 'draft.changed', projectId: created.project.projectId, revisionId: changed.revision.revisionId, version: 1 })}\n\n`,
    )
    const accepted = await service.control.createDraftRun(
      created.project.projectId,
      changed.revision.revisionId,
      'main',
      currentEngineContract,
      {},
      'notification-run',
    )
    const runNotification = await reader.read()
    expect(new TextDecoder().decode(runNotification.value)).toBe(
      `data: ${JSON.stringify({ flowId: 'main', kind: 'run.created', projectId: created.project.projectId, runId: accepted.run.runId, version: 1 })}\n\n`,
    )
    await reader.cancel()
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})

it('serves immutable assets and limits the SPA fallback to non-reserved HTML navigation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-static-'))
  const publicDirectory = path.join(directory, 'public')
  await mkdir(path.join(publicDirectory, 'assets'), { recursive: true })
  await writeFile(path.join(publicDirectory, 'index.html'), '<!doctype html><title>Server shell</title>')
  await writeFile(path.join(publicDirectory, 'assets', 'app-1234.js'), 'globalThis.openFlow = true')
  const service = ServerService.open(path.join(directory, 'open-flow.sqlite'))
  const app = createServerApp(service, { publicDirectory })
  try {
    for (const target of ['/', '/projects/project-1', '/projects/project-1/flows/main/design']) {
      const response = await app.request(target, { headers: { accept: 'text/html' } })
      expect.soft(response.status, target).toBe(200)
      expect.soft(response.headers.get('cache-control'), target).toBe('no-cache')
      expect.soft(await response.text(), target).toContain('Server shell')
    }

    const asset = await app.request('/assets/app-1234.js')
    expect(asset.status).toBe(200)
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(await asset.text()).toBe('globalThis.openFlow = true')

    for (const target of ['/assets/missing.js', '/auth/missing', '/connector/page', '/oauth/callback', '/v1/missing']) {
      const response = await app.request(target, { headers: { accept: 'text/html' } })
      expect.soft(response.status, target).toBe(404)
      expect.soft(response.headers.get('content-type'), target).toContain('application/json')
    }
    expect((await app.request('/projects/project-1', { headers: { accept: 'application/json' } })).status).toBe(404)
    expect((await app.request('/projects/project-1', { headers: { accept: 'text/html' }, method: 'POST' })).status).toBe(404)

    const apiOnly = createServerApp(service)
    const withoutAssets = await apiOnly.request('/', { headers: { accept: 'text/html' } })
    expect(withoutAssets.status).toBe(404)
    expect(withoutAssets.headers.get('content-type')).toContain('application/json')
  } finally {
    await service.close()
    await rm(directory, { force: true, recursive: true })
  }
})
