import type { ChangeOperation, JsonValue } from '@oomol-lab/open-flow/project-change'
import type { RunStatus } from '@oomol-lab/open-flow/run-lifecycle'
import type { FlowRunOptions } from '@oomol-lab/open-flow/scheduler'
import type { Context, Next } from 'hono'
import type { ControlService, ProjectPosition, PublicationPosition, RunPosition, TriggerActivityPosition } from './control-service.ts'

import { controlErrorCode } from '@oomol-lab/open-flow/control-api'
import { resourceNameIssue } from '@oomol-lab/open-flow/project-change'
import { runStatuses } from '@oomol-lab/open-flow/run-lifecycle'
import { Hono } from 'hono'
import { ControlError } from './error.ts'

export type ResolveControlActor = (request: Request) => Promise<string | undefined> | string | undefined

type Environment = { Variables: { actorId: string } }
type InvalidCode = typeof controlErrorCode.pageInvalidCursor | typeof controlErrorCode.projectInvalid | typeof controlErrorCode.runInvalid
type RunInputs = NonNullable<FlowRunOptions['inputs']>

const maxRequestBytes = 5 * 1024 * 1024
const maxIdempotencyKeyLength = 256
const maxPageSize = 100
const defaultPageSize = 50
const runStatusSet: ReadonlySet<string> = new Set(runStatuses)
const encoder = new TextEncoder()

export function createControlApp(service: ControlService, resolveActor?: ResolveControlActor): Hono<Environment> {
  const app = new Hono<Environment>()
  const authenticate = async (context: Context<Environment>, next: Next): Promise<void> => {
    const actorId = await resolveActor?.(context.req.raw)
    if (actorId == null || actorId.length == 0) throw new ControlError(controlErrorCode.authenticationRequired, 'Authentication is required.')
    context.set('actorId', actorId)
    await next()
  }
  app.use('/trigger-keys', authenticate)
  app.use('/trigger-keys/*', authenticate)
  app.use('/projects', authenticate)
  app.use('/projects/*', authenticate)

  app.get('/trigger-keys', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, { keys: service.listTriggerKeys(), version: 1 })
  })

  app.get('/trigger-keys/catalog', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, { definitions: service.listTriggerDefinitions(), version: 1 })
  })

  app.get('/trigger-keys/:key', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, { definition: service.getTriggerKey(context.req.param('key')), version: 1 })
  })

  app.get('/projects', (context) => {
    const parameters = query(context.req.raw, ['cursor', 'includeTotal', 'limit'], controlErrorCode.projectInvalid)
    const limit = pageSize(parameters)
    const cursor = parameters.get('cursor')
    const after = cursor == null ? undefined : decodeCursor(cursor, 'projects')
    const includeTotal = optionalBoolean(parameters.get('includeTotal'), controlErrorCode.projectInvalid)
    const { next, page } = service.listProjects(limit, after, includeTotal)
    return response(200, { ...page, ...(next == null ? {} : { nextCursor: encodeCursor('projects', next) }) })
  })

  app.post('/projects', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.projectInvalid)
    exact(body, ['name', 'version'], controlErrorCode.projectInvalid)
    version(body.version, controlErrorCode.projectInvalid)
    const name = text(body.name, controlErrorCode.projectInvalid)
    if (name != name.trim() || resourceNameIssue(name) != null) invalid(controlErrorCode.projectInvalid, 'Project name is invalid.')
    const created = await service.createProject(context.get('actorId'), name, idempotencyKey(context.req.raw, controlErrorCode.projectInvalid))
    return response(created.created ? 201 : 200, created.project)
  })

  app.get('/projects/:projectId', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, service.getProject(context.req.param('projectId')))
  })

  app.delete('/projects/:projectId', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(202, service.retireProject(context.req.param('projectId')))
  })

  app.get('/projects/:projectId/draft', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, service.getDraft(context.req.param('projectId')))
  })

  app.get('/projects/:projectId/draft/sync', async (context) => {
    const parameters = query(context.req.raw, ['fromRevisionId'], controlErrorCode.projectInvalid)
    const fromRevisionId = parameters.get('fromRevisionId')
    if (fromRevisionId != null) text(fromRevisionId, controlErrorCode.projectInvalid)
    return response(200, await service.syncDraft(context.req.param('projectId')))
  })

  app.post('/projects/:projectId/draft/changes', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.projectInvalid)
    exact(body, ['expectedRevisionId', 'operations', 'version'], controlErrorCode.projectInvalid)
    version(body.version, controlErrorCode.projectInvalid)
    if (!Array.isArray(body.operations) || body.operations.length == 0) invalid(controlErrorCode.projectInvalid, 'Draft operations must be a non-empty array.')
    for (const operation of body.operations) {
      if (typeof record(operation, controlErrorCode.projectInvalid).kind != 'string')
        invalid(controlErrorCode.projectInvalid, 'Draft operation kind is invalid.')
    }
    return response(
      200,
      await service.changeDraft(
        context.get('actorId'),
        context.req.param('projectId'),
        text(body.expectedRevisionId, controlErrorCode.projectInvalid),
        body.operations as readonly ChangeOperation[],
      ),
    )
  })

  app.get('/projects/:projectId/revisions/:revisionId', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, service.getRevision(context.req.param('projectId'), context.req.param('revisionId')))
  })

  app.get('/projects/:projectId/flows', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const projectId = context.req.param('projectId')
    return response(200, { flows: await service.listFlows(projectId), projectId, version: 1 })
  })

  app.get('/projects/:projectId/connector/providers', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const projectId = context.req.param('projectId')
    return response(200, { projectId, providers: await service.listConnectorProviders(projectId), version: 1 })
  })

  app.get('/projects/:projectId/connector/actions', async (context) => {
    const parameters = query(context.req.raw, ['q', 'service'], controlErrorCode.projectInvalid)
    const projectId = context.req.param('projectId')
    const queryValue = parameters.get('q')?.trim()
    const serviceId = parameters.get('service')?.trim()
    if (queryValue != null && serviceId != null) invalid(controlErrorCode.projectInvalid, 'Connector Action query is invalid.')
    if (queryValue != null && (queryValue.length == 0 || queryValue.length > 256))
      invalid(controlErrorCode.projectInvalid, 'Connector Action query is invalid.')
    if (serviceId != null && (serviceId.length == 0 || serviceId.length > 256)) invalid(controlErrorCode.projectInvalid, 'Connector service is invalid.')
    const actions = queryValue == null ? await service.listConnectorActions(projectId, serviceId) : await service.searchConnectorActions(projectId, queryValue)
    return response(200, { actions, projectId, version: 1 })
  })

  app.get('/projects/:projectId/connector/actions/:actionId', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const projectId = context.req.param('projectId')
    return response(200, {
      action: await service.getConnectorAction(projectId, text(context.req.param('actionId'), controlErrorCode.projectInvalid)),
      projectId,
      version: 1,
    })
  })

  app.get('/projects/:projectId/connector/connections/:serviceId', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const projectId = context.req.param('projectId')
    const serviceId = connectorService(context.req.param('serviceId'))
    return response(200, { connections: await service.listConnectorConnections(projectId, serviceId), projectId, serviceId, version: 1 })
  })

  app.post('/projects/:projectId/connector/connections/:serviceId/page', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.projectInvalid)
    exact(body, ['returnUrl', 'version'], controlErrorCode.projectInvalid)
    version(body.version, controlErrorCode.projectInvalid)
    text(body.returnUrl, controlErrorCode.projectInvalid)
    const url = service.connectorConnectionPage(context.req.param('projectId'), connectorService(context.req.param('serviceId')))
    return response(200, { url, version: 1 })
  })

  app.get('/projects/:projectId/flows/:flowId/live', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, await service.getLive(context.req.param('projectId'), context.req.param('flowId')))
  })

  app.get('/projects/:projectId/flows/:flowId/triggers', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const projectId = context.req.param('projectId')
    const flowId = context.req.param('flowId')
    return response(200, { bindings: service.listFlowTriggerBindings(projectId, flowId), flowId, projectId, version: 1 })
  })

  app.get('/projects/:projectId/flows/:flowId/triggers/:triggerNodeId', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, {
      binding: service.getFlowTriggerBinding(
        context.req.param('projectId'),
        context.req.param('flowId'),
        context.req.param('triggerNodeId'),
        new URL(context.req.url).origin,
      ),
      version: 1,
    })
  })

  app.get('/projects/:projectId/flows/:flowId/triggers/:triggerNodeId/activities', (context) => {
    const parameters = query(context.req.raw, ['cursor', 'limit'], controlErrorCode.projectInvalid)
    const limit = pageSize(parameters)
    const projectId = context.req.param('projectId')
    const flowId = context.req.param('flowId')
    const triggerNodeId = context.req.param('triggerNodeId')
    const cursor = parameters.get('cursor')
    const after = cursor == null ? undefined : decodeTriggerActivityCursor(cursor, projectId, flowId, triggerNodeId)
    const { next, page } = service.listFlowTriggerActivities(projectId, flowId, triggerNodeId, limit, after)
    return response(200, { ...page, ...(next == null ? {} : { nextCursor: encodeTriggerActivityCursor(projectId, flowId, triggerNodeId, next) }) })
  })

  app.post('/projects/:projectId/flows/:flowId/triggers/:triggerNodeId/pause', async (context) => {
    await triggerOperation(context.req.raw)
    return response(
      200,
      service.changeFlowTriggerState(context.req.param('projectId'), context.req.param('flowId'), context.req.param('triggerNodeId'), 'paused'),
    )
  })

  app.post('/projects/:projectId/flows/:flowId/triggers/:triggerNodeId/resume', async (context) => {
    await triggerOperation(context.req.raw)
    return response(
      200,
      service.changeFlowTriggerState(context.req.param('projectId'), context.req.param('flowId'), context.req.param('triggerNodeId'), 'active'),
    )
  })

  app.post('/projects/:projectId/flows/:flowId/triggers/:triggerNodeId/test', async (context) => {
    await triggerOperation(context.req.raw)
    return response(200, await service.testFlowPollTrigger(context.req.param('projectId'), context.req.param('flowId'), context.req.param('triggerNodeId')))
  })

  app.get('/projects/:projectId/flows/:flowId/publications', (context) => {
    const parameters = query(context.req.raw, ['cursor', 'includeTotal', 'limit'], controlErrorCode.projectInvalid)
    const limit = pageSize(parameters)
    const projectId = context.req.param('projectId')
    const flowId = context.req.param('flowId')
    const cursor = parameters.get('cursor')
    const after = cursor == null ? undefined : decodePublicationCursor(cursor, projectId, flowId)
    const includeTotal = optionalBoolean(parameters.get('includeTotal'), controlErrorCode.projectInvalid)
    const { next, page } = service.listPublications(projectId, flowId, limit, after, includeTotal)
    return response(200, {
      ...page,
      ...(next == null ? {} : { nextCursor: encodePublicationCursor(projectId, flowId, next) }),
    })
  })

  app.get('/projects/:projectId/presentation', (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    return response(200, service.getPresentation(context.req.param('projectId')))
  })

  app.put('/projects/:projectId/presentation', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.projectInvalid)
    exact(body, ['expectedRevision', 'value', 'version'], controlErrorCode.projectInvalid)
    version(body.version, controlErrorCode.projectInvalid)
    const expectedRevision = positiveInteger(body.expectedRevision, controlErrorCode.projectInvalid)
    const value = record(body.value, controlErrorCode.projectInvalid) as Readonly<Record<string, JsonValue>>
    return response(200, service.updatePresentation(context.req.param('projectId'), expectedRevision, value))
  })

  app.post('/projects/:projectId/revisions/:revisionId/flows/:flowId/check', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.projectInvalid)
    exact(body, ['engineContract', 'version'], controlErrorCode.projectInvalid)
    version(body.version, controlErrorCode.projectInvalid)
    return response(
      200,
      await service.checkFlow(
        context.req.param('projectId'),
        context.req.param('revisionId'),
        context.req.param('flowId'),
        text(body.engineContract, controlErrorCode.projectInvalid),
      ),
    )
  })

  app.post('/projects/:projectId/revisions/:revisionId/flows/:flowId/publications', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.projectInvalid)
    exact(body, ['engineContract', 'expectedLivePublicationId', 'version'], controlErrorCode.projectInvalid)
    version(body.version, controlErrorCode.projectInvalid)
    if (body.expectedLivePublicationId !== null && (typeof body.expectedLivePublicationId != 'string' || body.expectedLivePublicationId.length == 0)) {
      invalid(controlErrorCode.projectInvalid, 'Expected Live Publication is invalid.')
    }
    const committed = await service.publishFlow(
      context.get('actorId'),
      context.req.param('projectId'),
      context.req.param('revisionId'),
      context.req.param('flowId'),
      text(body.engineContract, controlErrorCode.projectInvalid),
      body.expectedLivePublicationId as string | null,
      idempotencyKey(context.req.raw, controlErrorCode.projectInvalid),
    )
    return response(committed.created ? 201 : 200, committed.publication)
  })

  app.post('/projects/:projectId/flows/:flowId/publications/:publicationId/rollback', async (context) => {
    query(context.req.raw, [], controlErrorCode.projectInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.projectInvalid)
    exact(body, ['expectedLivePublicationId', 'version'], controlErrorCode.projectInvalid)
    version(body.version, controlErrorCode.projectInvalid)
    const committed = await service.rollbackFlow(
      context.get('actorId'),
      context.req.param('projectId'),
      context.req.param('flowId'),
      context.req.param('publicationId'),
      text(body.expectedLivePublicationId, controlErrorCode.projectInvalid),
      idempotencyKey(context.req.raw, controlErrorCode.projectInvalid),
    )
    return response(committed.created ? 201 : 200, committed.publication)
  })

  app.post('/projects/:projectId/revisions/:revisionId/flows/:flowId/runs', async (context) => {
    query(context.req.raw, [], controlErrorCode.runInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.runInvalid)
    exact(body, ['engineContract', 'inputs', 'version'], controlErrorCode.runInvalid)
    version(body.version, controlErrorCode.runInvalid)
    const accepted = await service.createDraftRun(
      context.req.param('projectId'),
      context.req.param('revisionId'),
      context.req.param('flowId'),
      text(body.engineContract, controlErrorCode.runInvalid),
      record(body.inputs, controlErrorCode.runInvalid) as RunInputs,
      idempotencyKey(context.req.raw, controlErrorCode.runInvalid),
    )
    return response(accepted.created ? 202 : 200, accepted.run)
  })

  app.post('/projects/:projectId/flows/:flowId/runs', async (context) => {
    query(context.req.raw, [], controlErrorCode.runInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.runInvalid)
    exact(body, ['inputs', 'version'], controlErrorCode.runInvalid)
    version(body.version, controlErrorCode.runInvalid)
    const accepted = await service.createLiveRun(
      context.req.param('projectId'),
      context.req.param('flowId'),
      record(body.inputs, controlErrorCode.runInvalid) as RunInputs,
      idempotencyKey(context.req.raw, controlErrorCode.runInvalid),
    )
    return response(accepted.created ? 202 : 200, accepted.run)
  })

  app.get('/projects/:projectId/runs', (context) => {
    const parameters = query(context.req.raw, ['cursor', 'flowId', 'limit', 'status'], controlErrorCode.runInvalid)
    const limit = pageSize(parameters, controlErrorCode.runInvalid)
    const cursor = parameters.get('cursor')
    const after = cursor == null ? undefined : decodeCursor(cursor, 'runs')
    const flowId = parameters.get('flowId') ?? undefined
    const status = parameters.get('status')
    if (status != null && !runStatusSet.has(status)) invalid(controlErrorCode.runInvalid, 'Run status is invalid.')
    const { next, page } = service.listRuns(context.req.param('projectId'), limit, {
      ...(after == null ? {} : { after }),
      ...(flowId == null ? {} : { flowId: text(flowId, controlErrorCode.runInvalid) }),
      ...(status == null ? {} : { status: status as RunStatus }),
    })
    return response(200, { ...page, ...(next == null ? {} : { nextCursor: encodeCursor('runs', next) }) })
  })

  app.get('/projects/:projectId/runs/:runId', (context) => {
    query(context.req.raw, [], controlErrorCode.runInvalid)
    return response(200, service.getRun(context.req.param('projectId'), context.req.param('runId')))
  })

  app.get('/projects/:projectId/runs/:runId/events', (context) => {
    const parameters = query(context.req.raw, ['after', 'limit'], controlErrorCode.runInvalid)
    const after = nonnegativeInteger(parameters.get('after'), 0, controlErrorCode.runInvalid)
    const limit = pageSize(parameters, controlErrorCode.runInvalid)
    return response(200, service.getRunEvents(context.req.param('projectId'), context.req.param('runId'), after, limit))
  })

  app.get('/projects/:projectId/runs/:runId/result', (context) => {
    query(context.req.raw, [], controlErrorCode.runInvalid)
    return response(200, service.getRunResult(context.req.param('projectId'), context.req.param('runId')))
  })

  app.post('/projects/:projectId/runs/:runId/cancel', async (context) => {
    query(context.req.raw, [], controlErrorCode.runInvalid)
    const body = await requestObject(context.req.raw, controlErrorCode.runInvalid)
    exact(body, ['version'], controlErrorCode.runInvalid)
    version(body.version, controlErrorCode.runInvalid)
    return response(200, service.cancelRun(context.req.param('projectId'), context.req.param('runId')))
  })

  return app
}

function response(status: number, body: unknown): Response {
  const source = JSON.stringify(body)
  return new Response(source, {
    headers: { 'content-length': String(encoder.encode(source).byteLength), 'content-type': 'application/json; charset=utf-8' },
    status,
  })
}

async function triggerOperation(request: Request): Promise<void> {
  query(request, [], controlErrorCode.projectInvalid)
  const body = await requestObject(request, controlErrorCode.projectInvalid)
  exact(body, ['version'], controlErrorCode.projectInvalid)
  version(body.version, controlErrorCode.projectInvalid)
}

async function requestObject(request: Request, code: InvalidCode): Promise<Record<string, unknown>> {
  const bytes = await readBody(request, maxRequestBytes, code)
  let value: unknown
  try {
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return invalid(code, 'Request body must be valid JSON.')
  }
  return record(value, code)
}

async function readBody(request: Request, limit: number, code: InvalidCode): Promise<Uint8Array> {
  if (request.body == null) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of request.body) {
    size += chunk.byteLength
    if (size > limit) invalid(code, 'Request body is too large.')
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function query(request: Request, allowed: readonly string[], code: InvalidCode): URLSearchParams {
  const parameters = new URL(request.url).searchParams
  for (const key of new Set(parameters.keys())) {
    if (!allowed.includes(key) || parameters.getAll(key).length != 1) invalid(code, 'Query parameters are invalid.')
  }
  return parameters
}

function exact(value: Record<string, unknown>, keys: readonly string[], code: InvalidCode): void {
  const actual = Object.keys(value)
  if (actual.length != keys.length || actual.some((key) => !keys.includes(key))) invalid(code, 'Request fields are invalid.')
}

function version(value: unknown, code: InvalidCode): void {
  if (value !== 1) invalid(code, 'Request version is invalid.')
}

function record(value: unknown, code: InvalidCode): Record<string, unknown> {
  if (value == null || typeof value != 'object' || Array.isArray(value)) invalid(code, 'Request value must be an object.')
  return value as Record<string, unknown>
}

function text(value: unknown, code: InvalidCode): string {
  if (typeof value != 'string' || value.length == 0) invalid(code, 'Request value must be a non-empty string.')
  return value
}

function connectorService(value: unknown): string {
  const service = text(value, controlErrorCode.projectInvalid)
  if (service.length > 256) invalid(controlErrorCode.projectInvalid, 'Connector service is invalid.')
  return service
}

function positiveInteger(value: unknown, code: InvalidCode): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) invalid(code, 'Request value must be a positive integer.')
  return value as number
}

function nonnegativeInteger(value: string | null, fallback: number, code: InvalidCode): number {
  if (value == null) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) invalid(code, 'Query value must be a nonnegative integer.')
  return parsed
}

function pageSize(parameters: URLSearchParams, code: InvalidCode = controlErrorCode.projectInvalid): number {
  const value = parameters.get('limit')
  if (value == null) return defaultPageSize
  const parsed = positiveInteger(Number(value), code)
  if (parsed > maxPageSize) invalid(code, `Page size cannot exceed ${maxPageSize}.`)
  return parsed
}

function optionalBoolean(value: string | null, code: InvalidCode): boolean {
  if (value == null || value == 'false') return false
  if (value == 'true') return true
  return invalid(code, 'Query value must be true or false.')
}

function idempotencyKey(request: Request, code: InvalidCode): string {
  const value = request.headers.get('idempotency-key')
  if (value == null || value.length == 0 || value.length > maxIdempotencyKeyLength) invalid(code, 'Idempotency-Key is invalid.')
  return value
}

function encodeCursor(kind: 'projects' | 'runs', position: ProjectPosition | RunPosition): string {
  return Buffer.from(JSON.stringify({ kind, ...position })).toString('base64url')
}

function encodePublicationCursor(projectId: string, flowId: string, position: PublicationPosition): string {
  return Buffer.from(JSON.stringify({ flowId, kind: 'publications', projectId, ...position })).toString('base64url')
}

function encodeTriggerActivityCursor(projectId: string, flowId: string, triggerNodeId: string, position: TriggerActivityPosition): string {
  return Buffer.from(JSON.stringify({ flowId, kind: 'trigger-activities', projectId, triggerNodeId, ...position })).toString('base64url')
}

function decodePublicationCursor(value: string, projectId: string, flowId: string): PublicationPosition {
  try {
    const decoded = record(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown, controlErrorCode.projectInvalid)
    exact(decoded, ['createdAt', 'flowId', 'kind', 'projectId', 'publicationId'], controlErrorCode.projectInvalid)
    if (
      decoded.kind != 'publications' ||
      decoded.projectId != projectId ||
      decoded.flowId != flowId ||
      !Number.isSafeInteger(decoded.createdAt) ||
      (decoded.createdAt as number) < 0
    ) {
      throw new Error()
    }
    return { createdAt: decoded.createdAt as number, publicationId: text(decoded.publicationId, controlErrorCode.projectInvalid) }
  } catch (error) {
    if (error instanceof ControlError) throw error
    return invalid(controlErrorCode.projectInvalid, 'Cursor is invalid.')
  }
}

function decodeTriggerActivityCursor(value: string, projectId: string, flowId: string, triggerNodeId: string): TriggerActivityPosition {
  try {
    const decoded = record(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown, controlErrorCode.pageInvalidCursor)
    exact(decoded, ['activityId', 'createdAt', 'flowId', 'kind', 'projectId', 'triggerNodeId'], controlErrorCode.pageInvalidCursor)
    if (
      decoded.kind != 'trigger-activities' ||
      decoded.projectId != projectId ||
      decoded.flowId != flowId ||
      decoded.triggerNodeId != triggerNodeId ||
      !Number.isSafeInteger(decoded.createdAt) ||
      (decoded.createdAt as number) < 0
    ) {
      throw new Error()
    }
    return { activityId: text(decoded.activityId, controlErrorCode.pageInvalidCursor), createdAt: decoded.createdAt as number }
  } catch (error) {
    if (error instanceof ControlError) throw error
    return invalid(controlErrorCode.pageInvalidCursor, 'Cursor is invalid.')
  }
}

function decodeCursor(value: string, kind: 'projects'): ProjectPosition
function decodeCursor(value: string, kind: 'runs'): RunPosition
function decodeCursor(value: string, kind: 'projects' | 'runs'): ProjectPosition | RunPosition {
  const code = kind == 'projects' ? controlErrorCode.projectInvalid : controlErrorCode.runInvalid
  try {
    const decoded = record(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown, code)
    if (decoded.kind != kind || !Number.isSafeInteger(decoded.createdAt) || (decoded.createdAt as number) < 0) throw new Error()
    if (kind == 'projects') {
      exact(decoded, ['createdAt', 'kind', 'projectId'], code)
      return { createdAt: decoded.createdAt as number, projectId: text(decoded.projectId, code) }
    }
    exact(decoded, ['createdAt', 'kind', 'runId'], code)
    return { createdAt: decoded.createdAt as number, runId: text(decoded.runId, code) }
  } catch (error) {
    if (error instanceof ControlError) throw error
    return invalid(code, 'Cursor is invalid.')
  }
}

function invalid(code: InvalidCode, message: string): never {
  throw new ControlError(code, message)
}
