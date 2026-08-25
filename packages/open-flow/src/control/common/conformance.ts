import { dequal } from 'dequal/lite'

export interface ControlApiConformanceHarness {
  readonly origin: string
  dispose(): Promise<void>
  request(request: Request): Promise<Response>
}

export interface ControlApiConformanceCase {
  readonly name: string
  verify(harness: ControlApiConformanceHarness): Promise<void>
}

type RecordValue = Readonly<Record<string, unknown>>

const engineContract = 'open-flow-engine/v1'

function fail(message: string): never {
  throw new Error(message)
}

function equal(actual: unknown, expected: unknown, message: string): void {
  if (!dequal(actual, expected)) fail(`${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`)
}

function record(value: unknown, message: string): RecordValue {
  if (value == null || typeof value != 'object' || Array.isArray(value)) fail(`${message}: expected an object.`)
  return value as RecordValue
}

function list(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${message}: expected an array.`)
  return value
}

function requiredString(value: unknown, message: string): string {
  if (typeof value != 'string' || value.length == 0) fail(`${message}: expected a non-empty string.`)
  return value
}

function exact(value: RecordValue, expected: readonly string[], message: string): void {
  equal(Object.keys(value).toSorted(), [...expected].toSorted(), `${message} fields`)
}

function connectorConnection(value: unknown, message: string): RecordValue {
  const connection = record(value, message)
  exact(connection, ['connectionId', 'displayName', 'isDefault', 'serviceId', 'status'], message)
  requiredString(connection.connectionId, `${message} connectionId`)
  requiredString(connection.displayName, `${message} displayName`)
  requiredString(connection.serviceId, `${message} serviceId`)
  if (typeof connection.isDefault != 'boolean') fail(`${message} isDefault: expected a boolean.`)
  if (!['active', 'disconnected', 'error', 'reauth_required'].includes(String(connection.status))) fail(`${message} status: invalid status.`)
  return connection
}

function connectorPort(value: unknown, input: boolean, message: string): void {
  const port = record(value, message)
  const hasDescription = Object.hasOwn(port, 'description')
  const hasValue = input && Object.hasOwn(port, 'value')
  exact(port, ['jsonSchema', 'nullable', ...(hasDescription ? ['description'] : []), ...(hasValue ? ['value'] : [])], message)
  if (typeof port.nullable != 'boolean') fail(`${message} nullable: expected a boolean.`)
  if (hasDescription && typeof port.description != 'string') fail(`${message} description: expected a string.`)
}

function connectorAction(value: unknown, message: string): RecordValue {
  const action = record(value, message)
  const hasConnection = Object.hasOwn(action, 'defaultConnection')
  const hasIcon = Object.hasOwn(action, 'icon')
  exact(
    action,
    [
      'actionId',
      ...(hasConnection ? ['defaultConnection'] : []),
      'description',
      ...(hasIcon ? ['icon'] : []),
      'inputs',
      'name',
      'outputs',
      'serviceId',
      'serviceName',
    ],
    message,
  )
  requiredString(action.actionId, `${message} actionId`)
  requiredString(action.name, `${message} name`)
  requiredString(action.serviceId, `${message} serviceId`)
  requiredString(action.serviceName, `${message} serviceName`)
  if (typeof action.description != 'string') fail(`${message} description: expected a string.`)
  if (hasIcon) requiredString(action.icon, `${message} icon`)
  for (const [handle, port] of Object.entries(record(action.inputs, `${message} inputs`))) connectorPort(port, true, `${message} input ${handle}`)
  for (const [handle, port] of Object.entries(record(action.outputs, `${message} outputs`))) connectorPort(port, false, `${message} output ${handle}`)
  if (hasConnection) {
    const connection = connectorConnection(action.defaultConnection, `${message} default Connection`)
    equal(connection.serviceId, action.serviceId, `${message} default Connection serviceId`)
    equal(connection.status, 'active', `${message} default Connection status`)
  }
  return action
}

async function json(response: Response, expectedStatus: number, message: string): Promise<RecordValue> {
  equal(response.status, expectedStatus, `${message} status`)
  const value: unknown = await response.json().catch(() => fail(`${message} body: expected JSON.`))
  return record(value, `${message} body`)
}

async function assertError(response: Response, expectedStatus: number, expectedCode: string, message: string): Promise<void> {
  const body = await json(response, expectedStatus, message)
  equal(record(body.error, `${message} error`).code, expectedCode, `${message} error code`)
  equal(body.version, 1, `${message} version`)
}

function request(harness: ControlApiConformanceHarness, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body != null && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return harness.request(new Request(new URL(path, harness.origin), { ...init, headers }))
}

function createProjectRequest(harness: ControlApiConformanceHarness, name: string, idempotencyKey: string): Promise<Response> {
  return request(harness, '/v1/projects', {
    body: JSON.stringify({ name, version: 1 }),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  })
}

async function createProject(harness: ControlApiConformanceHarness, name: string, idempotencyKey: string): Promise<RecordValue> {
  return await json(await createProjectRequest(harness, name, idempotencyKey), 201, 'Create Project')
}

function changeFlowRequest(harness: ControlApiConformanceHarness, projectId: string, expectedRevisionId: string, flowId: string): Promise<Response> {
  return request(harness, `/v1/projects/${encodeURIComponent(projectId)}/draft/changes`, {
    body: JSON.stringify({
      expectedRevisionId,
      operations: [{ flow: { graph: { nodes: {} }, name: 'Main' }, flowId, kind: 'flow.create' }],
      version: 1,
    }),
    method: 'POST',
  })
}

async function createFlow(harness: ControlApiConformanceHarness, projectId: string, expectedRevisionId: string, flowId = 'main'): Promise<RecordValue> {
  return await json(await changeFlowRequest(harness, projectId, expectedRevisionId, flowId), 200, 'Create Flow Revision')
}

function changedRevisionId(change: RecordValue, message: string): string {
  return requiredString(record(change.revision, `${message} revision`).revisionId, `${message} revisionId`)
}

function changeRequest(
  harness: ControlApiConformanceHarness,
  projectId: string,
  expectedRevisionId: string,
  operations: readonly unknown[],
): Promise<Response> {
  return request(harness, `/v1/projects/${encodeURIComponent(projectId)}/draft/changes`, {
    body: JSON.stringify({ expectedRevisionId, operations, version: 1 }),
    method: 'POST',
  })
}

function publishRequest(
  harness: ControlApiConformanceHarness,
  projectId: string,
  revisionId: string,
  flowId: string,
  expectedLivePublicationId: string | null,
  idempotencyKey: string,
): Promise<Response> {
  return request(
    harness,
    `/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/flows/${encodeURIComponent(flowId)}/publications`,
    {
      body: JSON.stringify({ engineContract, expectedLivePublicationId, version: 1 }),
      headers: { 'idempotency-key': idempotencyKey },
      method: 'POST',
    },
  )
}

function rollbackRequest(
  harness: ControlApiConformanceHarness,
  projectId: string,
  flowId: string,
  sourcePublicationId: string,
  expectedLivePublicationId: string,
  idempotencyKey: string,
): Promise<Response> {
  return request(
    harness,
    `/v1/projects/${encodeURIComponent(projectId)}/flows/${encodeURIComponent(flowId)}/publications/${encodeURIComponent(sourcePublicationId)}/rollback`,
    {
      body: JSON.stringify({ expectedLivePublicationId, version: 1 }),
      headers: { 'idempotency-key': idempotencyKey },
      method: 'POST',
    },
  )
}

function liveRunRequest(
  harness: ControlApiConformanceHarness,
  targetPublicationId: string,
  idempotencyKey: string,
  inputs: RecordValue = {},
): Promise<Response> {
  return request(harness, '/v1/runs', {
    body: JSON.stringify({ inputs, publicationId: targetPublicationId, version: 1 }),
    headers: { 'idempotency-key': idempotencyKey },
    method: 'POST',
  })
}

function publicationId(value: RecordValue, message: string): string {
  return requiredString(value.publicationId, `${message} publicationId`)
}

export const controlApiConformanceCases: readonly ControlApiConformanceCase[] = [
  {
    name: 'creates, replays, lists, reads, and retires a Project',
    async verify(harness) {
      const created = await createProject(harness, 'Control project', 'project-lifecycle')
      const projectId = requiredString(created.projectId, 'Created Project projectId')
      const initialRevisionId = requiredString(created.draftRevisionId, 'Created Project draftRevisionId')
      equal(created.name, 'Control project', 'Created Project name')
      equal(created.status, 'active', 'Created Project status')
      equal(created.version, 1, 'Created Project version')

      equal(await json(await createProjectRequest(harness, 'Control project', 'project-lifecycle'), 200, 'Replay Project'), created, 'Replayed Project')
      await assertError(await createProjectRequest(harness, 'Different project', 'project-lifecycle'), 409, 'project.conflict', 'Conflicting Project')

      equal(await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}`), 200, 'Read Project'), created, 'Read Project')
      const listed = await json(await request(harness, '/v1/projects?includeTotal=true'), 200, 'List Projects')
      equal(listed.projects, [created], 'Listed Projects')
      equal(listed.total, 1, 'Project total')

      const draft = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}/draft`), 200, 'Read initial Draft')
      equal(draft.revisionId, initialRevisionId, 'Initial Draft revisionId')
      equal(draft.projectId, projectId, 'Initial Draft projectId')

      const remove = () => request(harness, `/v1/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })
      const retired = await json(await remove(), 202, 'Retire Project')
      equal(retired.status, 'retiring', 'Retired Project status')
      equal(retired.projectId, projectId, 'Retired Project projectId')
      equal(await json(await remove(), 202, 'Replay Project retirement'), retired, 'Replayed Project retirement')

      await assertError(await changeFlowRequest(harness, projectId, initialRevisionId, 'rejected'), 409, 'project.busy', 'Mutation after retirement')
    },
  },
  {
    name: 'commits immutable Draft Revisions and projects the current Flows',
    async verify(harness) {
      const project = await createProject(harness, 'Draft project', 'draft-project')
      const projectId = requiredString(project.projectId, 'Draft Project projectId')
      const initialRevisionId = requiredString(project.draftRevisionId, 'Draft Project revisionId')
      const changed = await createFlow(harness, projectId, initialRevisionId)
      const currentRevisionId = changedRevisionId(changed, 'Changed Draft')
      if (currentRevisionId == initialRevisionId) fail('Changed Draft must advance the Revision identity.')
      equal(record(changed.revision, 'Changed Draft revision').parentRevisionId, initialRevisionId, 'Changed Draft parentRevisionId')

      await assertError(await changeFlowRequest(harness, projectId, initialRevisionId, 'stale'), 412, 'project.revision-conflict', 'Stale Draft change')

      const currentProject = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}`), 200, 'Read changed Project')
      equal(currentProject.draftRevisionId, currentRevisionId, 'Current Project Draft head')

      const oldRevision = await json(
        await request(harness, `/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(initialRevisionId)}`),
        200,
        'Read immutable Revision',
      )
      equal(record(record(oldRevision.content, 'Old Revision content').document, 'Old Revision document').flows, {}, 'Old Revision Flows')

      const draft = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}/draft`), 200, 'Read current Draft')
      equal(draft.revisionId, currentRevisionId, 'Current Draft revisionId')
      const flows = record(record(draft.content, 'Current Draft content').document, 'Current Draft document').flows
      equal(Object.keys(record(flows, 'Current Draft Flows')), ['main'], 'Current Draft Flow ids')

      const snapshot = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}/draft/sync`), 200, 'Sync Draft snapshot')
      equal(snapshot.kind, 'snapshot', 'Draft snapshot kind')
      equal(record(snapshot.draft, 'Draft snapshot').revisionId, currentRevisionId, 'Draft snapshot revisionId')

      const sync = await json(
        await request(harness, `/v1/projects/${encodeURIComponent(projectId)}/draft/sync?fromRevisionId=${encodeURIComponent(initialRevisionId)}`),
        200,
        'Sync Draft from parent',
      )
      if (sync.kind == 'snapshot') {
        equal(record(sync.draft, 'Draft sync snapshot').revisionId, currentRevisionId, 'Draft sync snapshot revisionId')
      } else if (sync.kind == 'changes') {
        const revisions = list(sync.revisions, 'Draft sync revisions')
        const last = record(revisions.at(-1), 'Last Draft sync revision')
        equal(record(last.revision, 'Last Draft sync revision metadata').revisionId, currentRevisionId, 'Last Draft sync revisionId')
      } else {
        fail(`Draft sync kind: expected changes or snapshot, received ${JSON.stringify(sync.kind)}.`)
      }

      const projected = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}/flows`), 200, 'List Draft Flows')
      const projectedFlows = list(projected.flows, 'Projected Flows')
      const projectedFlow = record(projectedFlows[0], 'Projected Flow')
      equal(projectedFlows.length, 1, 'Projected Flow count')
      equal(projectedFlow.flowId, 'main', 'Projected Flow id')
      equal(record(projectedFlow.draft, 'Projected Flow Draft').revisionId, currentRevisionId, 'Projected Flow Revision')
    },
  },
  {
    name: 'keeps Presentation CAS independent from the Draft head',
    async verify(harness) {
      const project = await createProject(harness, 'Presentation project', 'presentation-project')
      const projectId = requiredString(project.projectId, 'Presentation Project projectId')
      const draftRevisionId = requiredString(project.draftRevisionId, 'Presentation Project Draft head')
      const path = `/v1/projects/${encodeURIComponent(projectId)}/presentation`
      const initial = await json(await request(harness, path), 200, 'Read initial Presentation')
      equal(initial.revision, 1, 'Initial Presentation revision')

      const value = { nodes: { task: { x: 120, y: 80 } } }
      const updated = await json(
        await request(harness, path, { body: JSON.stringify({ expectedRevision: 1, value, version: 1 }), method: 'PUT' }),
        200,
        'Update Presentation',
      )
      equal(updated.revision, 2, 'Updated Presentation revision')
      equal(updated.value, value, 'Updated Presentation value')
      equal(await json(await request(harness, path), 200, 'Read updated Presentation'), updated, 'Persisted Presentation')

      await assertError(
        await request(harness, path, { body: JSON.stringify({ expectedRevision: 1, value: {}, version: 1 }), method: 'PUT' }),
        412,
        'project.presentation-conflict',
        'Stale Presentation update',
      )
      const currentProject = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}`), 200, 'Read Presentation Project')
      equal(currentProject.draftRevisionId, draftRevisionId, 'Draft head after Presentation update')
    },
  },
  {
    name: 'validates one Flow from a fixed ProjectRevision',
    async verify(harness) {
      const project = await createProject(harness, 'Validation project', 'validation-project')
      const projectId = requiredString(project.projectId, 'Validation Project projectId')
      const changed = await createFlow(harness, projectId, requiredString(project.draftRevisionId, 'Validation Project Draft head'))
      const currentRevisionId = changedRevisionId(changed, 'Validation Revision')
      const revision = record(changed.revision, 'Validation Revision')
      const path = `/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(currentRevisionId)}/flows`
      const checked = await json(
        await request(harness, `${path}/main/check`, {
          body: JSON.stringify({ engineContract, version: 1 }),
          method: 'POST',
        }),
        200,
        'Check Flow',
      )
      equal(checked.projectId, projectId, 'Flow check projectId')
      equal(checked.revisionId, currentRevisionId, 'Flow check revisionId')
      equal(checked.revisionDigest, revision.digest, 'Flow check revision digest')
      equal(checked.flowId, 'main', 'Flow check flowId')
      equal(checked.engineContract, engineContract, 'Flow check Engine Contract')
      equal(checked.modelVersion, 1, 'Flow check model version')
      equal(checked.valid, true, 'Flow check validity')
      requiredString(checked.closureDigest, 'Flow check closure digest')

      await assertError(
        await request(harness, `${path}/missing/check`, {
          body: JSON.stringify({ engineContract, version: 1 }),
          method: 'POST',
        }),
        404,
        'flow.not-found',
        'Missing Flow check',
      )
    },
  },
  {
    name: 'admits, observes, and cancels one fixed Draft Run',
    async verify(harness) {
      const project = await createProject(harness, 'Run project', 'run-project')
      const projectId = requiredString(project.projectId, 'Run Project projectId')
      const changed = await createFlow(harness, projectId, requiredString(project.draftRevisionId, 'Run Project Draft head'))
      const currentRevisionId = changedRevisionId(changed, 'Run Revision')
      const runPath = `/v1/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(currentRevisionId)}/flows/main/runs`
      const runRequest = () =>
        request(harness, runPath, {
          body: JSON.stringify({ engineContract, inputs: {}, version: 1 }),
          headers: { 'idempotency-key': 'draft-run' },
          method: 'POST',
        })
      const run = await json(await runRequest(), 202, 'Create Draft Run')
      const runId = requiredString(run.runId, 'Draft Run runId')
      equal(run.projectId, projectId, 'Draft Run projectId')
      equal(run.revisionId, currentRevisionId, 'Draft Run revisionId')
      equal(run.flowId, 'main', 'Draft Run flowId')
      equal(run.source, 'draft', 'Draft Run source')
      equal(run.status, 'queued', 'Draft Run status')
      equal(await json(await runRequest(), 200, 'Replay Draft Run'), run, 'Replayed Draft Run')

      const observationPath = `/v1/runs/${encodeURIComponent(runId)}`
      equal(await json(await request(harness, observationPath), 200, 'Read Draft Run'), run, 'Read Draft Run')
      const listed = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}/runs`), 200, 'List Draft Runs')
      equal(listed.projectId, projectId, 'Run list projectId')
      equal(
        list(listed.runs, 'Listed Runs').map((value) => record(value, 'Listed Run').runId),
        [runId],
        'Listed Run ids',
      )

      const events = await json(await request(harness, `${observationPath}/events`), 200, 'Read queued Run events')
      const [queued] = list(events.events, 'Queued Run events')
      equal(record(queued, 'Queued Run event').kind, 'run.queued', 'Queued Run event kind')
      equal(events.done, false, 'Queued Run events done')
      await assertError(await request(harness, `${observationPath}/result`), 409, 'run.not-terminal', 'Read pending Run result')

      const other = await createProject(harness, 'Other project', 'other-run-project')
      const otherProjectId = requiredString(other.projectId, 'Other Project projectId')
      equal(
        list(
          (await json(await request(harness, `/v1/projects/${encodeURIComponent(otherProjectId)}/runs`), 200, 'List other Project Runs')).runs,
          'Other Project Runs',
        ),
        [],
        'Run remains scoped to its fixed Project list',
      )

      const cancel = () =>
        request(harness, `${observationPath}/cancel`, {
          body: JSON.stringify({ version: 1 }),
          method: 'POST',
        })
      const canceled = await json(await cancel(), 200, 'Cancel Draft Run')
      equal(canceled, { cancelAccepted: true, runId, status: 'canceled', version: 1 }, 'Canceled Draft Run')
      const result = await json(await request(harness, `${observationPath}/result`), 200, 'Read canceled Run result')
      equal(result.runId, runId, 'Canceled Run result runId')
      equal(result.status, 'canceled', 'Canceled Run result status')
      requiredString(result.finishedAt, 'Canceled Run result finishedAt')

      const terminal = await json(await request(harness, `${observationPath}/events?after=1`), 200, 'Read terminal Run events')
      const [terminalEvent] = list(terminal.events, 'Terminal Run events')
      equal(record(terminalEvent, 'Terminal Run event').kind, 'run.canceled', 'Terminal Run event kind')
      equal(terminal.done, true, 'Terminal Run events done')
      equal(
        await json(await cancel(), 200, 'Replay Run cancellation'),
        { cancelAccepted: false, runId, status: 'canceled', version: 1 },
        'Replayed cancellation',
      )
    },
  },
]

export const publicationControlApiConformanceCases: readonly ControlApiConformanceCase[] = [
  {
    name: 'publishes one immutable Flow with idempotent Live CAS',
    async verify(harness) {
      const project = await createProject(harness, 'Publication project', 'publication-project')
      const projectId = requiredString(project.projectId, 'Publication Project projectId')
      const changed = await createFlow(harness, projectId, requiredString(project.draftRevisionId, 'Publication Project Draft head'))
      const revision = record(changed.revision, 'Publication Revision')
      const revisionId = requiredString(revision.revisionId, 'Publication Revision revisionId')
      const flowPath = `/v1/projects/${encodeURIComponent(projectId)}/flows/main`

      const unpublished = await json(await request(harness, `${flowPath}/live`), 200, 'Read unpublished Live')
      equal(unpublished.projectId, projectId, 'Unpublished Live projectId')
      equal(unpublished.flowId, 'main', 'Unpublished Live flowId')
      equal(unpublished.publication, null, 'Unpublished Live Publication')
      equal(unpublished.revision, 0, 'Unpublished Live revision')
      equal(unpublished.status, 'not-published', 'Unpublished Live status')
      equal(unpublished.hasUnpublishedChanges, true, 'Unpublished Live Draft state')
      await assertError(await liveRunRequest(harness, 'publication_missing', 'missing-live-run'), 404, 'publication.not-found', 'Run missing Publication')

      const publish = () => publishRequest(harness, projectId, revisionId, 'main', null, 'publication-first')
      const first = await json(await publish(), 201, 'Publish Flow')
      const firstPublicationId = publicationId(first, 'Published Flow')
      equal(first.projectId, projectId, 'Publication projectId')
      equal(first.flowId, 'main', 'Publication flowId')
      equal(first.revisionId, revisionId, 'Publication revisionId')
      equal(first.revisionDigest, revision.digest, 'Publication revision digest')
      equal(first.engineContract, engineContract, 'Publication Engine Contract')
      equal(first.modelVersion, 1, 'Publication model version')
      equal(first.operation, 'publish', 'Publication operation')
      equal(first.sourcePublicationId, undefined, 'Publication source')
      equal(first.version, 1, 'Publication version')
      requiredString(first.actorId, 'Publication actorId')
      requiredString(first.closureDigest, 'Publication closure digest')
      requiredString(first.createdAt, 'Publication createdAt')
      equal(await json(await publish(), 200, 'Replay Publish'), first, 'Replayed Publication')

      await assertError(
        await publishRequest(harness, projectId, revisionId, 'main', firstPublicationId, 'publication-first'),
        409,
        'publication.conflict',
        'Conflicting Publish replay',
      )
      await assertError(
        await publishRequest(harness, projectId, revisionId, 'main', null, 'publication-stale-live'),
        412,
        'live.conflict',
        'Stale Publish Live precondition',
      )

      const live = await json(await request(harness, `${flowPath}/live`), 200, 'Read published Live')
      equal(live.publication, first, 'Live Publication')
      equal(live.revision, 1, 'Published Live revision')
      equal(live.status, 'runnable', 'Published Live status')
      equal(live.hasUnpublishedChanges, false, 'Published Live Draft state')

      const flows = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}/flows`), 200, 'List published Flows')
      const [projectedValue] = list(flows.flows, 'Published Flow projection')
      const projected = record(projectedValue, 'Published Flow')
      equal(record(record(projected.live, 'Published Flow Live').publication, 'Published Flow Publication'), first, 'Projected Publication')
      equal(record(projected.live, 'Published Flow Live').revision, 1, 'Projected Live revision')
      equal(projected.hasUnpublishedChanges, false, 'Projected unpublished state')

      const history = await json(await request(harness, `${flowPath}/publications?includeTotal=true`), 200, 'List Publication history')
      equal(history.publications, [first], 'Publication history')
      equal(history.total, 1, 'Publication history total')
    },
  },
  {
    name: 'rolls back immutable history and fixes a Live Run target',
    async verify(harness) {
      const project = await createProject(harness, 'Rollback project', 'rollback-project')
      const projectId = requiredString(project.projectId, 'Rollback Project projectId')
      const firstChange = await createFlow(harness, projectId, requiredString(project.draftRevisionId, 'Rollback Project Draft head'))
      const firstRevisionId = changedRevisionId(firstChange, 'First Rollback Revision')
      const first = await json(
        await publishRequest(harness, projectId, firstRevisionId, 'main', null, 'rollback-publish-first'),
        201,
        'Publish first Rollback Revision',
      )
      const firstPublicationId = publicationId(first, 'First Rollback Publication')

      const secondChange = await json(
        await changeRequest(harness, projectId, firstRevisionId, [
          {
            kind: 'graph.node.create',
            node: {
              concurrency: 1,
              inputs: {},
              kind: 'value',
              values: { ready: { jsonSchema: { type: 'boolean' }, nullable: false, value: true } },
            },
            nodeId: 'marker',
            target: { id: 'main', kind: 'flow' },
          },
        ]),
        200,
        'Create second Rollback Revision',
      )
      const secondRevisionId = changedRevisionId(secondChange, 'Second Rollback Revision')
      const second = await json(
        await publishRequest(harness, projectId, secondRevisionId, 'main', firstPublicationId, 'rollback-publish-second'),
        201,
        'Publish second Rollback Revision',
      )
      const secondPublicationId = publicationId(second, 'Second Rollback Publication')

      const rollback = () => rollbackRequest(harness, projectId, 'main', firstPublicationId, secondPublicationId, 'rollback-first')
      const restored = await json(await rollback(), 201, 'Rollback Flow')
      const restoredPublicationId = publicationId(restored, 'Rollback Publication')
      if (restoredPublicationId == firstPublicationId || restoredPublicationId == secondPublicationId) {
        fail('Rollback must create a new Publication identity.')
      }
      equal(restored.operation, 'rollback', 'Rollback operation')
      equal(restored.sourcePublicationId, firstPublicationId, 'Rollback source Publication')
      equal(restored.revisionId, first.revisionId, 'Rollback fixed Revision')
      equal(restored.revisionDigest, first.revisionDigest, 'Rollback fixed Revision digest')
      equal(restored.closureDigest, first.closureDigest, 'Rollback fixed closure digest')
      equal(restored.engineContract, first.engineContract, 'Rollback fixed Engine Contract')
      equal(await json(await rollback(), 200, 'Replay Rollback'), restored, 'Replayed Rollback')
      await assertError(
        await rollbackRequest(harness, projectId, 'main', firstPublicationId, restoredPublicationId, 'rollback-first'),
        409,
        'publication.conflict',
        'Conflicting Rollback replay',
      )

      const livePath = `/v1/projects/${encodeURIComponent(projectId)}/flows/main`
      const live = await json(await request(harness, `${livePath}/live`), 200, 'Read rolled back Live')
      equal(live.publication, restored, 'Rolled back Live Publication')
      equal(live.revision, 3, 'Rolled back Live revision')
      equal(live.hasUnpublishedChanges, true, 'Rolled back Live Draft state')
      const currentProject = await json(await request(harness, `/v1/projects/${encodeURIComponent(projectId)}`), 200, 'Read Rollback Project')
      equal(currentProject.draftRevisionId, secondRevisionId, 'Draft head after Rollback')

      const firstPage = await json(await request(harness, `${livePath}/publications?includeTotal=true&limit=2`), 200, 'List first Publication page')
      equal(firstPage.publications, [restored, second], 'First Publication page')
      equal(firstPage.total, 3, 'Publication page total')
      const cursor = requiredString(firstPage.nextCursor, 'Publication next cursor')
      const secondPage = await json(
        await request(harness, `${livePath}/publications?cursor=${encodeURIComponent(cursor)}&limit=2`),
        200,
        'List second Publication page',
      )
      equal(secondPage.publications, [first], 'Second Publication page')
      equal(secondPage.nextCursor, undefined, 'Final Publication cursor')

      const createRun = () => liveRunRequest(harness, restoredPublicationId, 'rollback-live-run')
      const run = await json(await createRun(), 202, 'Create rolled back Live Run')
      const runId = requiredString(run.runId, 'Rolled back Live Run runId')
      equal(run.projectId, projectId, 'Live Run projectId')
      equal(run.flowId, 'main', 'Live Run flowId')
      equal(run.publicationId, restoredPublicationId, 'Live Run Publication')
      equal(run.revisionId, firstRevisionId, 'Live Run fixed Revision')
      equal(run.source, 'live', 'Live Run source')
      equal(run.status, 'queued', 'Live Run status')
      equal(await json(await createRun(), 200, 'Replay Live Run'), run, 'Replayed Live Run')
      await assertError(
        await liveRunRequest(harness, restoredPublicationId, 'rollback-live-run', { changed: {} }),
        409,
        'run.conflict',
        'Conflicting Live Run replay',
      )

      await json(
        await publishRequest(harness, projectId, secondRevisionId, 'main', restoredPublicationId, 'rollback-publish-current'),
        201,
        'Move Live after Run admission',
      )
      equal(await json(await request(harness, `/v1/runs/${encodeURIComponent(runId)}`), 200, 'Read fixed Live Run'), run, 'Live Run after Live moved')
    },
  },
  {
    name: 'retires Live when its Flow or Project is retired',
    async verify(harness) {
      const deletedProject = await createProject(harness, 'Deleted Flow project', 'deleted-flow-project')
      const deletedProjectId = requiredString(deletedProject.projectId, 'Deleted Flow Project projectId')
      const deletedChange = await createFlow(harness, deletedProjectId, requiredString(deletedProject.draftRevisionId, 'Deleted Flow Project Draft head'))
      const deletedRevisionId = changedRevisionId(deletedChange, 'Deleted Flow Revision')
      const deletedPublication = await json(
        await publishRequest(harness, deletedProjectId, deletedRevisionId, 'main', null, 'deleted-flow-publish'),
        201,
        'Publish deleted Flow',
      )
      await json(await changeRequest(harness, deletedProjectId, deletedRevisionId, [{ flowId: 'main', kind: 'flow.delete' }]), 200, 'Delete published Flow')

      const deletedPath = `/v1/projects/${encodeURIComponent(deletedProjectId)}/flows/main`
      const deletedLive = await json(await request(harness, `${deletedPath}/live`), 200, 'Read deleted Flow Live')
      equal(deletedLive.publication, null, 'Deleted Flow Live Publication')
      equal(deletedLive.revision, 0, 'Deleted Flow Live revision')
      equal(deletedLive.status, 'not-published', 'Deleted Flow Live status')
      equal(deletedLive.hasUnpublishedChanges, false, 'Deleted Flow unpublished state')
      const deletedFlows = await json(await request(harness, `/v1/projects/${encodeURIComponent(deletedProjectId)}/flows`), 200, 'List deleted Flows')
      equal(deletedFlows.flows, [], 'Deleted Flow projection')
      const deletedHistory = await json(await request(harness, `${deletedPath}/publications?includeTotal=true`), 200, 'List deleted Flow history')
      equal(deletedHistory.publications, [deletedPublication], 'Deleted Flow Publication history')
      equal(deletedHistory.total, 1, 'Deleted Flow Publication total')
      await assertError(
        await liveRunRequest(harness, publicationId(deletedPublication, 'Deleted Flow Publication'), 'deleted-flow-run'),
        412,
        'live.conflict',
        'Run deleted Flow Publication',
      )

      const retiredProject = await createProject(harness, 'Retired Live project', 'retired-live-project')
      const retiredProjectId = requiredString(retiredProject.projectId, 'Retired Live Project projectId')
      const retiredChange = await createFlow(harness, retiredProjectId, requiredString(retiredProject.draftRevisionId, 'Retired Live Project Draft head'))
      const retiredRevisionId = changedRevisionId(retiredChange, 'Retired Live Revision')
      const retiredPublication = await json(
        await publishRequest(harness, retiredProjectId, retiredRevisionId, 'main', null, 'retired-live-publish'),
        201,
        'Publish retiring Project Flow',
      )
      const retiredPublicationId = publicationId(retiredPublication, 'Retired Live Publication')
      await json(await request(harness, `/v1/projects/${encodeURIComponent(retiredProjectId)}`, { method: 'DELETE' }), 202, 'Retire Live Project')

      const retiredPath = `/v1/projects/${encodeURIComponent(retiredProjectId)}/flows/main`
      const retiredLive = await json(await request(harness, `${retiredPath}/live`), 200, 'Read retired Project Live')
      equal(retiredLive.publication, null, 'Retired Project Live Publication')
      equal(retiredLive.revision, 0, 'Retired Project Live revision')
      equal(retiredLive.status, 'not-published', 'Retired Project Live status')
      const retiredHistory = await json(await request(harness, `${retiredPath}/publications?includeTotal=true`), 200, 'List retired Publication history')
      equal(retiredHistory.publications, [retiredPublication], 'Retired Publication history')
      equal(retiredHistory.total, 1, 'Retired Publication total')
      await assertError(await liveRunRequest(harness, retiredPublicationId, 'retired-live-run'), 409, 'project.busy', 'Run retired Live')
      await assertError(
        await publishRequest(harness, retiredProjectId, retiredRevisionId, 'main', null, 'retired-live-republish'),
        409,
        'project.busy',
        'Publish retired Project',
      )
      await assertError(
        await rollbackRequest(harness, retiredProjectId, 'main', retiredPublicationId, retiredPublicationId, 'retired-live-rollback'),
        409,
        'project.busy',
        'Rollback retired Project',
      )
    },
  },
]

export const triggerControlApiConformanceCases: readonly ControlApiConformanceCase[] = [
  {
    name: 'exposes one deployment-scoped Trigger Key catalog',
    async verify(harness) {
      const summariesResponse = await json(await request(harness, '/v1/trigger-keys'), 200, 'List Trigger Keys')
      const definitionsResponse = await json(await request(harness, '/v1/trigger-keys/catalog'), 200, 'List Trigger definitions')
      const summaries = list(summariesResponse.keys, 'Trigger Key summaries').map((value) => record(value, 'Trigger Key summary'))
      const definitions = list(definitionsResponse.definitions, 'Trigger definitions').map((value) => record(value, 'Trigger definition'))
      equal(summariesResponse.version, 1, 'Trigger Key summaries version')
      equal(definitionsResponse.version, 1, 'Trigger definitions version')
      equal(
        summaries.map((summary) => requiredString(summary.key, 'Trigger Key summary key')),
        definitions.map((definition) => requiredString(definition.key, 'Trigger definition key')),
        'Trigger catalog identities',
      )
      for (const [index, summary] of summaries.entries()) {
        const definition = definitions[index]!
        const type = summary.type
        if (type != 'integration' && type != 'poll') fail(`Trigger Key summary type: expected integration or poll, received ${JSON.stringify(type)}.`)
        equal(definition.type, type, 'Trigger definition type')
        if (typeof summary.description != 'string') fail(`Trigger Key summary description: expected string, received ${JSON.stringify(summary.description)}.`)
        requiredString(summary.displayName, 'Trigger Key summary displayName')
        requiredString(summary.name, 'Trigger Key summary name')
        requiredString(summary.provider, 'Trigger Key summary provider')
        const key = requiredString(summary.key, 'Trigger Key summary key')
        const detail = await json(await request(harness, `/v1/trigger-keys/${encodeURIComponent(key)}`), 200, 'Read Trigger Key')
        equal(detail.definition, definition, 'Trigger Key detail')
        equal(detail.version, 1, 'Trigger Key detail version')
      }
      await assertError(await request(harness, '/v1/trigger-keys/conformance.missing'), 404, 'trigger-key.not-found', 'Read missing Trigger Key')
    },
  },
  {
    name: 'operates and retires one Live Trigger binding without creating another execution history',
    async verify(harness) {
      const created = await createProject(harness, 'Trigger project', 'trigger-project')
      const projectId = requiredString(created.projectId, 'Trigger Project projectId')
      const initialRevisionId = requiredString(created.draftRevisionId, 'Trigger Project Draft head')
      const changed = await json(
        await changeRequest(harness, projectId, initialRevisionId, [
          {
            flow: {
              graph: {
                nodes: {
                  cron: {
                    cronTimes: [{ type: 'every', unit: 'hour', value: 1 }],
                    kind: 'cron',
                    name: 'Scheduled',
                  },
                  webhook: {
                    inputsDef: [],
                    kind: 'webhook',
                    name: 'Incoming',
                  },
                },
              },
              name: 'Triggered',
            },
            flowId: 'main',
            kind: 'flow.create',
          },
        ]),
        200,
        'Create Trigger Flow',
      )
      const revisionId = changedRevisionId(changed, 'Trigger Revision')
      const firstPublication = await json(
        await publishRequest(harness, projectId, revisionId, 'main', null, 'trigger-publication-1'),
        201,
        'Publish Trigger Flow',
      )
      const firstPublicationId = publicationId(firstPublication, 'First Trigger Publication')
      const base = `/v1/projects/${encodeURIComponent(projectId)}/flows/main/triggers`

      const listed = await json(await request(harness, base), 200, 'List Trigger bindings')
      equal(listed.projectId, projectId, 'Trigger binding list projectId')
      equal(listed.flowId, 'main', 'Trigger binding list flowId')
      equal(listed.version, 1, 'Trigger binding list version')
      const bindings = list(listed.bindings, 'Trigger bindings').map((value) => record(value, 'Trigger binding'))
      equal(
        bindings.map((binding) => binding.triggerNodeId),
        ['cron', 'webhook'],
        'Trigger binding order',
      )
      for (const binding of bindings) {
        equal(binding.currentPublicationId, firstPublicationId, 'Trigger binding current Publication')
        equal(binding.currentRevisionId, revisionId, 'Trigger binding current Revision')
        equal(binding.operatorState, 'active', 'Trigger binding operator state')
        equal(binding.health, 'healthy', 'Trigger binding health')
        equal(binding.runtimeVersion, 1, 'Initial Trigger runtime version')
        equal(binding.endpointUrl, undefined, 'Trigger list endpoint URL')
        equal(binding.version, 1, 'Trigger binding version')
        requiredString(binding.updatedAt, 'Trigger binding updatedAt')
      }

      const webhookPath = `${base}/webhook`
      const webhookDetail = await json(await request(harness, webhookPath), 200, 'Read Webhook binding')
      const webhook = record(webhookDetail.binding, 'Webhook binding detail')
      const endpointUrl = requiredString(webhook.endpointUrl, 'Webhook endpoint URL')
      equal(webhook.kind, 'webhook', 'Webhook binding kind')
      equal(webhookDetail.version, 1, 'Webhook binding detail version')
      const cronDetail = await json(await request(harness, `${base}/cron`), 200, 'Read Cron binding')
      equal(record(cronDetail.binding, 'Cron binding detail').endpointUrl, undefined, 'Cron endpoint URL')

      const state = (action: 'pause' | 'resume') => request(harness, `${webhookPath}/${action}`, { body: JSON.stringify({ version: 1 }), method: 'POST' })
      const paused = await json(await state('pause'), 200, 'Pause Webhook binding')
      equal(paused.operatorState, 'paused', 'Paused Webhook operator state')
      equal(paused.runtimeVersion, 2, 'Paused Webhook runtime version')
      equal(await json(await state('pause'), 200, 'Replay Webhook pause'), paused, 'Replayed Webhook pause')
      equal((await harness.request(new Request(endpointUrl, { method: 'POST' }))).status, 404, 'Paused Webhook callback status')

      const secondPublication = await json(
        await publishRequest(harness, projectId, revisionId, 'main', firstPublicationId, 'trigger-publication-2'),
        201,
        'Republish paused Trigger Flow',
      )
      const secondPublicationId = publicationId(secondPublication, 'Second Trigger Publication')
      const pausedAfterPublish = record((await json(await request(harness, webhookPath), 200, 'Read paused republished binding')).binding, 'Paused binding')
      equal(pausedAfterPublish.currentPublicationId, secondPublicationId, 'Paused binding current Publication')
      equal(pausedAfterPublish.operatorState, 'paused', 'Paused binding state after Publish')
      equal(pausedAfterPublish.runtimeVersion, 3, 'Paused binding runtime after Publish')
      equal((await harness.request(new Request(endpointUrl, { method: 'POST' }))).status, 404, 'Republished paused Webhook callback status')

      const resumed = await json(await state('resume'), 200, 'Resume Webhook binding')
      equal(resumed.operatorState, 'active', 'Resumed Webhook operator state')
      equal(resumed.runtimeVersion, 4, 'Resumed Webhook runtime version')
      equal((await harness.request(new Request(endpointUrl, { method: 'POST' }))).status, 200, 'Resumed Webhook callback status')
      await assertError(
        await request(harness, `${webhookPath}/test`, { body: JSON.stringify({ version: 1 }), method: 'POST' }),
        404,
        'trigger.not-found',
        'Test non-Poll binding',
      )

      const firstActivities = await json(await request(harness, `${webhookPath}/activities?limit=1`), 200, 'List first Trigger Activity')
      const firstActivity = record(list(firstActivities.activities, 'First Trigger Activity page')[0], 'First Trigger Activity')
      equal(firstActivity.kind, 'operator.resumed', 'First Trigger Activity kind')
      requiredString(firstActivity.activityId, 'First Trigger Activity id')
      requiredString(firstActivity.createdAt, 'First Trigger Activity createdAt')
      const activityCursor = requiredString(firstActivities.nextCursor, 'First Trigger Activity cursor')
      const secondActivities = await json(
        await request(harness, `${webhookPath}/activities?cursor=${encodeURIComponent(activityCursor)}&limit=1`),
        200,
        'List second Trigger Activity',
      )
      const secondActivity = record(list(secondActivities.activities, 'Second Trigger Activity page')[0], 'Second Trigger Activity')
      equal(secondActivity.kind, 'operator.paused', 'Second Trigger Activity kind')
      equal(secondActivities.nextCursor, undefined, 'Last Trigger Activity cursor')
      await assertError(
        await request(harness, `${base}/cron/activities?cursor=${encodeURIComponent(activityCursor)}`),
        400,
        'page.invalid-cursor',
        'Cross-binding Trigger Activity cursor',
      )

      const removed = await json(
        await changeRequest(harness, projectId, revisionId, [{ kind: 'graph.node.delete', nodeId: 'webhook', target: { id: 'main', kind: 'flow' } }]),
        200,
        'Delete Webhook Trigger',
      )
      const retiredRevisionId = changedRevisionId(removed, 'Retired Trigger Revision')
      await json(
        await publishRequest(harness, projectId, retiredRevisionId, 'main', secondPublicationId, 'trigger-publication-3'),
        201,
        'Publish retired Webhook Trigger',
      )
      const retired = record((await json(await request(harness, webhookPath), 200, 'Read retired Webhook binding')).binding, 'Retired Webhook binding')
      equal(retired.currentPublicationId, undefined, 'Retired Webhook current Publication')
      equal(retired.currentRevisionId, undefined, 'Retired Webhook current Revision')
      equal(retired.endpointUrl, undefined, 'Retired Webhook endpoint URL')
      equal((await harness.request(new Request(endpointUrl, { method: 'POST' }))).status, 404, 'Retired Webhook callback status')
      await assertError(await state('pause'), 404, 'trigger.not-found', 'Pause retired Webhook binding')
      const retainedActivities = await json(await request(harness, `${webhookPath}/activities`), 200, 'Read retired Trigger Activities')
      equal(list(retainedActivities.activities, 'Retired Trigger Activities').length, 2, 'Retired Trigger Activity count')
    },
  },
]

export const connectorControlApiConformanceCases: readonly ControlApiConformanceCase[] = [
  {
    name: 'projects one Connector catalog and its authorized Connections',
    async verify(harness) {
      const created = await createProject(harness, 'Connector project', 'connector-project')
      const projectId = requiredString(created.projectId, 'Connector Project projectId')
      const base = `/v1/projects/${encodeURIComponent(projectId)}/connector`

      const providerPage = await json(await request(harness, `${base}/providers`), 200, 'List Connector Providers')
      exact(providerPage, ['projectId', 'providers', 'version'], 'Connector Provider page')
      equal(providerPage.projectId, projectId, 'Connector Provider page projectId')
      equal(providerPage.version, 1, 'Connector Provider page version')
      const providers = list(providerPage.providers, 'Connector Providers').map((value, index) => {
        const provider = record(value, `Connector Provider ${index}`)
        const hasIcon = Object.hasOwn(provider, 'icon')
        exact(provider, ['serviceId', 'serviceName', ...(hasIcon ? ['icon'] : [])], `Connector Provider ${index}`)
        requiredString(provider.serviceId, `Connector Provider ${index} serviceId`)
        requiredString(provider.serviceName, `Connector Provider ${index} serviceName`)
        if (hasIcon) requiredString(provider.icon, `Connector Provider ${index} icon`)
        return provider
      })
      if (providers.length == 0) fail('Connector conformance deployment must expose at least one Provider.')

      const completePage = await json(await request(harness, `${base}/actions`), 200, 'List all Connector Actions')
      exact(completePage, ['actions', 'projectId', 'version'], 'Complete Connector Action page')
      equal(completePage.projectId, projectId, 'Complete Connector Action page projectId')
      equal(completePage.version, 1, 'Complete Connector Action page version')
      const actions = list(completePage.actions, 'Complete Connector Actions').map((value, index) =>
        connectorAction(value, `Complete Connector Action ${index}`),
      )
      if (actions.length == 0) fail('Connector conformance deployment must expose at least one Action.')
      const selected = actions[0]!
      const serviceId = requiredString(selected.serviceId, 'Selected Connector Action serviceId')
      if (!providers.some((provider) => provider.serviceId == serviceId)) fail('Selected Connector Action must refer to a listed Provider.')

      const servicePage = await json(await request(harness, `${base}/actions?service=${encodeURIComponent(serviceId)}`), 200, 'List Provider Connector Actions')
      exact(servicePage, ['actions', 'projectId', 'version'], 'Provider Connector Action page')
      equal(servicePage.projectId, projectId, 'Provider Connector Action page projectId')
      equal(servicePage.version, 1, 'Provider Connector Action page version')
      const serviceActions = list(servicePage.actions, 'Provider Connector Actions').map((value, index) =>
        connectorAction(value, `Provider Connector Action ${index}`),
      )
      if (!serviceActions.some((action) => action.actionId == selected.actionId)) fail('Provider Action list must include the selected Action.')

      const query = requiredString(selected.name, 'Selected Connector Action name')
      const searchPage = await json(await request(harness, `${base}/actions?q=${encodeURIComponent(query)}`), 200, 'Search Connector Actions')
      exact(searchPage, ['actions', 'projectId', 'version'], 'Searched Connector Action page')
      equal(searchPage.projectId, projectId, 'Searched Connector Action page projectId')
      equal(searchPage.version, 1, 'Searched Connector Action page version')
      const searched = list(searchPage.actions, 'Searched Connector Actions').map((value, index) =>
        connectorAction(value, `Searched Connector Action ${index}`),
      )
      if (!searched.some((action) => action.actionId == selected.actionId)) fail('Connector Action search must include an exact name match.')

      const actionId = requiredString(selected.actionId, 'Selected Connector Action actionId')
      const detail = await json(await request(harness, `${base}/actions/${encodeURIComponent(actionId)}`), 200, 'Read Connector Action')
      exact(detail, ['action', 'projectId', 'version'], 'Connector Action detail')
      equal(connectorAction(detail.action, 'Connector Action detail Action'), selected, 'Connector Action detail')
      equal(detail.projectId, projectId, 'Connector Action detail projectId')
      equal(detail.version, 1, 'Connector Action detail version')

      const connectionPage = await json(await request(harness, `${base}/connections/${encodeURIComponent(serviceId)}`), 200, 'List Connector Connections')
      exact(connectionPage, ['connections', 'projectId', 'serviceId', 'version'], 'Connector Connection page')
      equal(connectionPage.projectId, projectId, 'Connector Connection page projectId')
      equal(connectionPage.serviceId, serviceId, 'Connector Connection page serviceId')
      equal(connectionPage.version, 1, 'Connector Connection page version')
      const connections = list(connectionPage.connections, 'Connector Connections').map((value, index) =>
        connectorConnection(value, `Connector Connection ${index}`),
      )
      const defaultConnection = Object.hasOwn(selected, 'defaultConnection')
        ? connectorConnection(selected.defaultConnection, 'Selected Connector Action default Connection')
        : undefined
      if (defaultConnection != null && !connections.some((connection) => connection.connectionId == defaultConnection.connectionId)) {
        fail('Connector Action default Connection must be present in the service Connection list.')
      }

      const externalPage = await json(
        await request(harness, `${base}/connections/${encodeURIComponent(serviceId)}/page`, {
          body: JSON.stringify({ version: 1 }),
          method: 'POST',
        }),
        200,
        'Create Connector Connection page',
      )
      exact(externalPage, ['url', 'version'], 'Connector Connection external page')
      const pageUrl = new URL(requiredString(externalPage.url, 'Connector Connection external page URL'))
      if (pageUrl.protocol != 'http:' && pageUrl.protocol != 'https:') fail('Connector Connection external page URL must use HTTP.')
      equal(externalPage.version, 1, 'Connector Connection external page version')
    },
  },
  {
    name: 'rejects invalid or out-of-scope Connector discovery requests',
    async verify(harness) {
      const created = await createProject(harness, 'Connector validation', 'connector-validation')
      const projectId = requiredString(created.projectId, 'Connector validation Project projectId')
      const base = `/v1/projects/${encodeURIComponent(projectId)}/connector`
      await assertError(await request(harness, `${base}/actions?service=mail&q=send`), 400, 'project.invalid', 'Conflicting Connector Action query')
      await assertError(await request(harness, `${base}/actions?q=%20%20`), 400, 'project.invalid', 'Empty Connector Action query')
      await assertError(await request(harness, `${base}/actions?q=${'a'.repeat(257)}`), 400, 'project.invalid', 'Oversized Connector Action query')
      await assertError(await request(harness, `${base}/connections/${'a'.repeat(257)}`), 400, 'project.invalid', 'Oversized Connector service')
      await assertError(
        await request(harness, `${base}/connections/mail/page`, {
          body: JSON.stringify({ extra: true, version: 1 }),
          method: 'POST',
        }),
        400,
        'project.invalid',
        'Malformed Connector Connection page',
      )
      await assertError(
        await request(harness, '/v1/projects/00000000-0000-7000-8000-000000000000/connector/providers'),
        404,
        'project.not-found',
        'Out-of-scope Connector Project',
      )
      await assertError(await request(harness, `${base}/actions/conformance.missing`), 404, 'connector.action-not-found', 'Missing Connector Action')
    },
  },
]
