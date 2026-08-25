import { describe, expect, it, vi } from 'vitest'
import { runCli } from './cli.ts'

function project(revisionId = 'revision-1') {
  return {
    createdAt: '2026-08-14T00:00:00.000Z',
    draftRevisionId: revisionId,
    name: 'Example',
    projectId: 'project-1',
    status: 'active',
    updatedAt: '2026-08-14T00:00:00.000Z',
    version: 1,
  }
}

function revision(revisionId: string, parentRevisionId: string) {
  return {
    actorId: 'actor-1',
    createdAt: '2026-08-14T00:00:00.000Z',
    digest: `digest-${revisionId}`,
    modelVersion: 1,
    parentRevisionId,
    projectId: 'project-1',
    revisionId,
    version: 1,
  }
}

function flow(revisionId = 'revision-1') {
  return {
    draft: { closureDigest: 'closure-1', name: 'Main', revisionDigest: `digest-${revisionId}`, revisionId },
    flowId: 'flow-1',
    hasUnpublishedChanges: true,
    live: null,
  }
}

function draftRevision(
  nodes: Readonly<Record<string, unknown>> = {},
  modules: Readonly<Record<string, unknown>> = {},
  state: {
    readonly bindings?: Readonly<Record<string, unknown>>
    readonly tasks?: Readonly<Record<string, unknown>>
  } = {},
) {
  return {
    ...revision('revision-1', 'revision-0'),
    content: {
      document: {
        bindings: state.bindings ?? {},
        flows: { 'flow-1': { graph: { nodes }, name: 'Main' } },
        subflows: {},
        tasks: state.tasks ?? {},
      },
      modelVersion: 1,
      modules,
    },
  }
}

function publication(publicationId = 'publication-1', operation: 'publish' | 'rollback' = 'publish') {
  return {
    actorId: 'actor-1',
    closureDigest: 'closure-1',
    createdAt: '2026-08-14T00:00:00.000Z',
    engineContract: 'open-flow-engine/v1',
    flowId: 'flow-1',
    modelVersion: 1,
    operation,
    projectId: 'project-1',
    publicationId,
    revisionDigest: 'digest-revision-1',
    revisionId: 'revision-1',
    ...(operation == 'rollback' ? { sourcePublicationId: 'publication-old' } : {}),
    version: 1,
  }
}

function publishedFlow(revisionId = 'revision-1') {
  return {
    ...flow(revisionId),
    live: { publication: publication('publication-live'), revision: 1, status: 'runnable' },
  }
}

function run(source: 'draft' | 'live', status: 'completed' | 'queued' = 'queued') {
  return {
    closureDigest: 'closure-1',
    createdAt: '2026-08-14T00:00:00.000Z',
    engineContract: 'open-flow-engine/v1',
    engineDigest: 'engine-1',
    ...(status == 'completed' ? { finishedAt: '2026-08-14T00:00:01.000Z' } : {}),
    flowId: 'flow-1',
    modelVersion: 1,
    projectId: 'project-1',
    ...(source == 'live' ? { publicationId: 'publication-live' } : {}),
    revisionDigest: 'digest-revision-1',
    revisionId: 'revision-1',
    runId: source == 'draft' ? 'run-draft' : 'run-live',
    source,
    status,
    version: 1,
  }
}

function runtime(
  env: Readonly<Record<string, string | undefined>> = {},
  input: { readonly answers?: readonly string[]; readonly files?: Readonly<Record<string, string>>; readonly stdin?: string } = {},
) {
  let stdout = ''
  let stderr = ''
  const opened: string[] = []
  const answers = [...(input.answers ?? [])]
  return {
    value: {
      env,
      interactive: input.answers != null,
      language: 'en' as const,
      openUrl: async (url: string) => {
        opened.push(url)
      },
      question: async (prompt: string) => {
        stdout += prompt
        const answer = answers.shift()
        if (answer == null) throw new Error('Missing interactive answer.')
        return answer
      },
      readFile: async (path: string) => {
        const value = input.files?.[path]
        if (value == null) throw new Error(`Missing fixture ${path}.`)
        return value
      },
      readStdin: async () => input.stdin ?? '',
      stderr: { write: (value: string) => (stderr += value) },
      stdout: { write: (value: string) => (stdout += value) },
      wait: async () => {},
    },
    opened: () => opened,
    stderr: () => stderr,
    stdout: () => stdout,
  }
}

describe('CLI', () => {
  it('prints help without waiting when stdin or stdout is not a TTY', async () => {
    const output = runtime()
    const request = vi.fn()

    await expect(
      runCli([], { request: request, getProject: async () => undefined, getWorkbenchUrl: async () => '', setProject: async () => {} }, output.value),
    ).resolves.toBe(0)

    expect(output.stdout()).toContain('Open Flow commands')
    expect(request).not.toHaveBeenCalled()
  })

  it('rejects special characters in Flow names before changing the Draft', async () => {
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      throw new Error(path)
    })
    const output = runtime()

    await expect(
      runCli(
        ['create', 'flow12&&&!@#$', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        output.value,
      ),
    ).resolves.toBe(1)

    expect(JSON.parse(output.stderr())).toMatchObject({ error: { code: 'cli.invalid-arguments', message: expect.stringContaining('letters, numbers') } })
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/draft/changes'))).toBe(false)
  })

  it('uses the TTY only as a Project, Flow, and stateless action selector', async () => {
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects?limit=100') return Response.json({ projects: [project()], version: 1 })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') {
        return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      }
      if (path == '/v1/projects/project-1/revisions/revision-1/flows/flow-1/check') {
        return Response.json({
          closureDigest: 'closure-1',
          diagnostics: [],
          engineContract: 'open-flow-engine/v1',
          flowId: 'flow-1',
          modelVersion: 1,
          projectId: 'project-1',
          revisionDigest: 'digest-revision-1',
          revisionId: 'revision-1',
          valid: true,
          version: 1,
        })
      }
      throw new Error(path)
    })
    const output = runtime({}, { answers: ['1', '1', '3', '6', '9'] })
    const workbench = vi.fn(async () => 'https://console.example/team/example/flows/project-1/flows/flow-1/design')

    await expect(
      runCli([], { request: request, getProject: async () => undefined, getWorkbenchUrl: workbench, setProject: async () => {} }, output.value),
    ).resolves.toBe(0)

    expect(output.stdout()).toContain('valid\trevision\tMain\tflow-1')
    expect(output.stdout()).toContain('https://console.example/team/example/flows/project-1/flows/flow-1/design')
    expect(output.opened()).toEqual(['https://console.example/team/example/flows/project-1/flows/flow-1/design'])
    expect(workbench).toHaveBeenCalledWith('project-1', 'flow-1')
    expect(request.mock.calls.filter(([path]) => String(path).endsWith('/check'))).toHaveLength(1)
  })

  it('opens the Workbench only for the open command', async () => {
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') {
        return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      }
      throw new Error(path)
    })
    const url = 'https://console.example/team/example/flows/project-1/flows/flow-1/design'
    const host = {
      request: request,
      getProject: async () => undefined,
      getWorkbenchUrl: async () => url,
      setProject: async () => {},
    }
    const open = runtime()
    const workbench = runtime()

    await expect(runCli(['open', 'Main', '--project', 'project-1', '--json'], host, open.value)).resolves.toBe(0)
    await expect(runCli(['workbench', 'Main', '--project', 'project-1', '--json'], host, workbench.value)).resolves.toBe(0)

    expect(open.opened()).toEqual([url])
    expect(JSON.parse(open.stdout())).toMatchObject({ kind: 'flow.open', url })
    expect(workbench.opened()).toEqual([])
    expect(JSON.parse(workbench.stdout())).toMatchObject({ kind: 'flow.workbench', url })
  })

  it('creates a Project and Flow through the existing handlers before entering the action menu', async () => {
    let projects: ReturnType<typeof project>[] = []
    let flows: ReturnType<typeof flow>[] = []
    let mutationRequests = 0
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path == '/v1/projects?limit=100') return Response.json({ projects, version: 1 })
      if (path == '/v1/projects' && init?.method == 'POST') {
        projects = [{ ...project(), name: 'Created' }]
        return Response.json(projects[0])
      }
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') {
        return Response.json({ flows, projectId: 'project-1', version: 1 })
      }
      if (path == '/v1/projects/project-1/draft/changes') {
        mutationRequests += 1
        const body = JSON.parse(String(init?.body)) as { readonly operations: readonly { readonly flowId: string }[] }
        flows = [{ ...flow('revision-2'), flowId: body.operations[0]!.flowId }]
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-1', flowId: flows[0]!.flowId, name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      throw new Error(path)
    })
    const output = runtime({}, { answers: ['1', 'Created', '1', 'Main', '9'] })

    await expect(runCli([], { request: request, getProject: async () => undefined, setProject: async () => {} }, output.value)).resolves.toBe(0)

    expect(projects).toHaveLength(1)
    expect(flows).toHaveLength(1)
    expect(mutationRequests).toBe(1)
    expect(output.stdout()).toContain('Created\tproject-1\tactive')
    expect(output.stdout()).toContain('Main')
  })

  it('stores a verified Project and reads it from another invocation', async () => {
    let selected: string | undefined
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      return Response.json({ error: { code: 'route.not-found', message: path } }, { status: 404 })
    })
    const host = {
      request: request,
      getProject: async () => selected,
      getWorkbenchUrl: async () => '',
      setProject: async (projectId: string) => {
        selected = projectId
      },
    }

    const first = runtime()
    await expect(runCli(['project', 'use', 'project-1', '--json'], host, first.value)).resolves.toBe(0)
    const second = runtime()
    await expect(runCli(['list', '--json'], host, second.value)).resolves.toBe(0)

    expect(selected).toBe('project-1')
    expect(JSON.parse(second.stdout())).toMatchObject({ flows: [{ flowId: 'flow-1' }], kind: 'flow.list' })
    expect(request.mock.calls.map((call) => call[0])).toEqual(['/v1/projects/project-1', '/v1/projects/project-1', '/v1/projects/project-1/flows'])
  })

  it('creates a Flow with one revision-guarded POST and no idempotency key', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/draft/changes') {
        const body = JSON.parse(String(init?.body)) as { readonly operations: readonly { readonly flowId: string }[] }
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: body.operations[0]!.flowId, name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      throw new Error(path)
    })
    const output = runtime()

    const exitCode = await runCli(
      ['create', 'Main', '--project', 'project-1', '--json'],
      { request: request, getProject: async () => undefined, setProject: async () => {} },
      output.value,
    )

    expect(exitCode).toBe(0)
    const mutation = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutation).toHaveLength(1)
    expect(new Headers(mutation[0]!.init?.headers).has('idempotency-key')).toBe(false)
    expect(JSON.parse(String(mutation[0]!.init?.body))).toMatchObject({ expectedRevisionId: 'revision-1', operations: [{ kind: 'flow.create' }] })
    expect(JSON.parse(output.stdout())).toMatchObject({ kind: 'flow.create', revision: { revisionId: 'revision-2' }, target: { name: 'Main' } })
  })

  it('does not retry a stale Flow mutation', async () => {
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      return Response.json({ error: { code: 'project.revision-conflict', message: 'The Draft changed.' }, version: 1 }, { status: 412 })
    })
    const output = runtime()

    const exitCode = await runCli(
      ['rename', 'Main', 'Renamed', '--project', 'project-1', '--json'],
      { request: request, getProject: async () => undefined, setProject: async () => {} },
      output.value,
    )

    expect(exitCode).toBe(1)
    expect(request.mock.calls.filter(([path]) => String(path).endsWith('/draft/changes'))).toHaveLength(1)
    expect(JSON.parse(output.stderr())).toMatchObject({ error: { code: 'project.revision-conflict' }, version: 1 })
  })

  it('reports an unknown outcome when the mutation response is lost', async () => {
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      throw new TypeError('connection closed')
    })
    const output = runtime()

    const exitCode = await runCli(
      ['delete', 'flow-1', '--yes', '--project', 'project-1', '--json'],
      { request: request, getProject: async () => undefined, setProject: async () => {} },
      output.value,
    )

    expect(exitCode).toBe(1)
    expect(request.mock.calls.filter(([path]) => String(path).endsWith('/draft/changes'))).toHaveLength(1)
    expect(JSON.parse(output.stderr())).toMatchObject({
      error: { code: 'flow.mutation-outcome-unknown', details: { baseRevisionId: 'revision-1', projectId: 'project-1' } },
      version: 1,
    })
  })

  it('checks the immutable Revision selected by the Flow summary', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path == '/v1/projects/project-1') return Response.json(project('revision-2'))
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow('revision-2')], projectId: 'project-1', version: 1 })
      return Response.json({
        closureDigest: 'closure-1',
        diagnostics: [],
        engineContract: 'open-flow-engine/v1',
        flowId: 'flow-1',
        modelVersion: 1,
        projectId: 'project-1',
        request: JSON.parse(String(init?.body)),
        revisionDigest: 'digest-revision-2',
        revisionId: 'revision-2',
        valid: true,
        version: 1,
      })
    })
    const output = runtime()

    const exitCode = await runCli(
      ['check', 'Main', '--project=project-1', '--json'],
      { request: request, getProject: async () => undefined, setProject: async () => {} },
      output.value,
    )

    expect(exitCode).toBe(0)
    expect(request).toHaveBeenLastCalledWith(
      '/v1/projects/project-1/revisions/revision-2/flows/flow-1/check',
      expect.objectContaining({ body: JSON.stringify({ engineContract: 'open-flow-engine/v1', version: 1 }), method: 'POST' }),
    )
  })

  it('keeps Draft and Live Run sources explicit while reading input from files and stdin', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [publishedFlow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/runs/run-draft') return Response.json(run('draft', 'completed'))
      if (path.includes('/revisions/') && path.endsWith('/runs')) return Response.json(run('draft'), { status: 202 })
      if (path == '/v1/runs') return Response.json(run('live'), { status: 202 })
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const draft = runtime({}, { files: { 'inputs.json': '{"start":{"value":1}}' } })
    const live = runtime({}, { stdin: '{"start":{"value":2}}' })

    await expect(runCli(['run', 'Main', '--input', '@inputs.json', '--wait', '--project', 'project-1', '--json'], host, draft.value)).resolves.toBe(0)
    await expect(runCli(['run', 'Main', '--source=live', '--input', '-', '--project', 'project-1', '--json'], host, live.value)).resolves.toBe(0)

    const posts = requests.filter(({ path }) => path.endsWith('/runs') && !path.includes('/projects/project-1/runs/'))
    expect(posts.map(({ path }) => path)).toEqual(['/v1/projects/project-1/revisions/revision-1/flows/flow-1/runs', '/v1/runs'])
    expect(posts.map(({ init }) => JSON.parse(String(init?.body)).inputs)).toEqual([{ start: { value: 1 } }, { start: { value: 2 } }])
    expect(posts.map(({ init }) => new Headers(init?.headers).get('idempotency-key'))).toEqual([expect.stringMatching(/^run-/), expect.stringMatching(/^run-/)])
    expect(JSON.parse(draft.stdout())).toMatchObject({ kind: 'run.create', run: { revisionId: 'revision-1', source: 'draft', status: 'completed' } })
    expect(JSON.parse(live.stdout())).toMatchObject({
      kind: 'run.create',
      run: { publicationId: 'publication-live', revisionId: 'revision-1', source: 'live' },
    })
  })

  it('publishes with Live CAS, reads history, and rolls back to an exact Publication', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const old = publication('publication-old')
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project('revision-2'))
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [publishedFlow('revision-2')], projectId: 'project-1', version: 1 })
      if (path.endsWith('/live')) {
        return Response.json({
          flowId: 'flow-1',
          hasUnpublishedChanges: true,
          projectId: 'project-1',
          publication: publication('publication-live'),
          revision: 1,
          status: 'runnable',
          version: 1,
        })
      }
      if (path.includes('/publications?')) return Response.json({ publications: [old], version: 1 })
      if (path.endsWith('/rollback')) return Response.json(publication('publication-rollback', 'rollback'), { status: 201 })
      if (path.endsWith('/publications')) {
        return Response.json({ ...publication('publication-new'), revisionDigest: 'digest-revision-2', revisionId: 'revision-2' }, { status: 201 })
      }
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }

    const publish = runtime()
    const show = runtime()
    const rollback = runtime()
    await expect(runCli(['publish', 'Main', '--project', 'project-1', '--json'], host, publish.value)).resolves.toBe(0)
    await expect(runCli(['publications', 'show', 'Main', 'publication-old', '--project', 'project-1', '--json'], host, show.value)).resolves.toBe(0)
    await expect(runCli(['rollback', 'Main', 'publication-old', '--project', 'project-1', '--json'], host, rollback.value)).resolves.toBe(0)

    const publishRequest = requests.find(({ path }) => path == '/v1/projects/project-1/revisions/revision-2/flows/flow-1/publications')!
    expect(JSON.parse(String(publishRequest.init?.body))).toMatchObject({ expectedLivePublicationId: 'publication-live' })
    expect(new Headers(publishRequest.init?.headers).get('idempotency-key')).toMatch(/^publication-/)
    const rollbackRequest = requests.find(({ path }) => path.endsWith('/publications/publication-old/rollback'))!
    expect(JSON.parse(String(rollbackRequest.init?.body))).toEqual({ expectedLivePublicationId: 'publication-live', version: 1 })
    expect(JSON.parse(show.stdout())).toMatchObject({ kind: 'publication.show', publication: { publicationId: 'publication-old' } })
    expect(JSON.parse(rollback.stdout())).toMatchObject({ kind: 'publication.rollback', publication: { operation: 'rollback' } })
  })

  it('lists and observes Runs through bounded public pages', async () => {
    const requests: string[] = []
    const request = vi.fn(async (path: string) => {
      requests.push(path)
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path.includes('/runs?')) return Response.json({ nextCursor: 'cursor-2', projectId: 'project-1', runs: [run('draft', 'completed')], version: 1 })
      if (path.endsWith('/events?after=0&limit=1')) {
        return Response.json({
          done: false,
          events: [{ createdAt: '2026-08-14T00:00:00.000Z', kind: 'run.queued', payload: {}, sequence: 1 }],
          historyComplete: true,
          nextAfter: 1,
          runId: 'run-draft',
          version: 1,
        })
      }
      if (path.endsWith('/events?after=1&limit=1')) {
        return Response.json({
          done: true,
          events: [{ createdAt: '2026-08-14T00:00:01.000Z', kind: 'run.completed', payload: {}, sequence: 2 }],
          historyComplete: true,
          nextAfter: 2,
          runId: 'run-draft',
          version: 1,
        })
      }
      if (path.endsWith('/result')) {
        return Response.json({ finishedAt: '2026-08-14T00:00:01.000Z', result: { value: 1 }, runId: 'run-draft', status: 'completed', version: 1 })
      }
      if (path.endsWith('/cancel')) return Response.json({ cancelAccepted: false, runId: 'run-draft', status: 'completed', version: 1 })
      if (path.endsWith('/runs/run-draft')) return Response.json(run('draft', 'completed'))
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const list = runtime()
    const show = runtime()
    const events = runtime()
    const result = runtime()
    const cancel = runtime()

    await expect(
      runCli(
        ['runs', 'list', '--flow', 'Main', '--status', 'completed', '--cursor', 'cursor-1', '--limit', '1', '--project', 'project-1', '--json'],
        host,
        list.value,
      ),
    ).resolves.toBe(0)
    await expect(runCli(['runs', 'show', 'run-draft', '--project', 'project-1', '--json'], host, show.value)).resolves.toBe(0)
    await expect(runCli(['runs', 'events', 'run-draft', '--follow', '--limit', '1', '--project', 'project-1', '--json'], host, events.value)).resolves.toBe(0)
    await expect(runCli(['runs', 'result', 'run-draft', '--project', 'project-1', '--json'], host, result.value)).resolves.toBe(0)
    await expect(runCli(['runs', 'cancel', 'run-draft', '--project', 'project-1', '--json'], host, cancel.value)).resolves.toBe(0)

    expect(requests).toContain('/v1/projects/project-1/runs?cursor=cursor-1&flowId=flow-1&limit=1&status=completed')
    expect(requests.filter((path) => path.includes('/events?'))).toEqual([
      '/v1/runs/run-draft/events?after=0&limit=1',
      '/v1/runs/run-draft/events?after=1&limit=1',
    ])
    expect(JSON.parse(list.stdout())).toMatchObject({ kind: 'run.list', nextCursor: 'cursor-2' })
    expect(JSON.parse(events.stdout())).toMatchObject({ done: true, events: [{ sequence: 1 }, { sequence: 2 }], historyComplete: true, kind: 'run.events' })
    expect(JSON.parse(result.stdout())).toMatchObject({ kind: 'run.result', result: { status: 'completed' } })
    expect(JSON.parse(cancel.stdout())).toMatchObject({ cancellation: { cancelAccepted: false }, kind: 'run.cancel' })
  })

  it('rejects malformed Run input before creating a Run', async () => {
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      throw new Error(path)
    })
    const output = runtime()

    await expect(
      runCli(
        ['run', 'Main', '--input', '[]', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        output.value,
      ),
    ).resolves.toBe(1)

    expect(JSON.parse(output.stderr())).toMatchObject({ error: { code: 'run.input-invalid' } })
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/runs'))).toBe(false)
  })

  it('reads Nodes from one immutable Draft Revision', async () => {
    const value = { concurrency: 1, inputs: {}, kind: 'value', name: 'Existing', values: { value: { jsonSchema: {}, nullable: true, value: null } } }
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') return Response.json(draftRevision({ existing: value }))
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const list = runtime()
    const show = runtime()

    await expect(runCli(['node', 'list', 'Main', '--project', 'project-1', '--json'], host, list.value)).resolves.toBe(0)
    await expect(runCli(['node', 'show', 'Main', 'Existing', '--project', 'project-1', '--json'], host, show.value)).resolves.toBe(0)

    expect(JSON.parse(list.stdout())).toMatchObject({
      kind: 'node.list',
      nodes: [{ kind: 'value', name: 'Existing', nodeId: 'existing' }],
      revisionId: 'revision-1',
    })
    expect(JSON.parse(show.stdout())).toMatchObject({ kind: 'node.show', node: { node: { kind: 'value' }, nodeId: 'existing' } })
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/draft/changes'))).toBe(false)
  })

  it('inspects Nodes, CodeModules, Edges, Triggers, and the authoritative Revision check together', async () => {
    const nodes = {
      code: {
        concurrency: 1,
        inputs: { value: { kind: 'value', value: null } },
        kind: 'task',
        name: 'Format',
        task: {
          inputs: { value: { jsonSchema: {}, nullable: true, value: null } },
          moduleId: 'module-code',
          name: 'Format',
          outputs: { result: { jsonSchema: { type: 'string' }, nullable: false } },
        },
      },
      notify: {
        concurrency: 1,
        inputs: { text: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'code', output: 'result' }] } },
        kind: 'task',
        name: 'Notify',
        taskId: 'task-notify',
      },
    }
    const tasks = {
      'task-notify': {
        executor: { action: 'bot.send', connectionId: 'connection-bot', kind: 'connector' },
        inputs: { text: { jsonSchema: { type: 'string' }, nullable: false } },
        name: 'Notify',
        outputs: {},
      },
    }
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') {
        return Response.json(
          draftRevision(
            nodes,
            { 'module-code': { imports: [], name: 'Format', source: 'export default function run() { return { result: "ok" } }\n' } },
            { tasks },
          ),
        )
      }
      if (path == '/v1/projects/project-1/revisions/revision-1/flows/flow-1/check') {
        return Response.json({
          closureDigest: 'closure-1',
          diagnostics: [],
          engineContract: 'open-flow-engine/v1',
          flowId: 'flow-1',
          modelVersion: 1,
          projectId: 'project-1',
          revisionDigest: 'digest-revision-1',
          revisionId: 'revision-1',
          valid: true,
          version: 1,
        })
      }
      throw new Error(path)
    })
    const output = runtime()
    const summaryOutput = runtime()

    await expect(
      runCli(
        ['inspect', 'Main', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        output.value,
      ),
    ).resolves.toBe(0)
    await expect(
      runCli(
        ['inspect', 'Main', '--summary', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        summaryOutput.value,
      ),
    ).resolves.toBe(0)

    expect(JSON.parse(output.stdout())).toMatchObject({
      check: { valid: true },
      edges: [{ input: 'text', source: { kind: 'node', nodeId: 'code', output: 'result' }, target: { nodeId: 'notify' } }],
      kind: 'flow.inspect',
      nodes: [
        { kind: 'code', moduleId: 'module-code', nodeId: 'code' },
        { actionId: 'bot.send', connectionId: 'connection-bot', kind: 'connector', nodeId: 'notify', taskId: 'task-notify' },
      ],
      revision: { revisionId: 'revision-1' },
    })
    expect(JSON.parse(summaryOutput.stdout())).toMatchObject({
      kind: 'flow.inspect',
      nodes: [
        { kind: 'code', moduleId: 'module-code', name: 'Format', nodeId: 'code' },
        { actionId: 'bot.send', connectionId: 'connection-bot', kind: 'connector', name: 'Notify', nodeId: 'notify', taskId: 'task-notify' },
      ],
      summary: true,
    })
    expect(summaryOutput.stdout()).not.toContain('export default function run')
  })

  it('applies a multi-Node Connector and Code graph with one Draft CAS write', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const gmailConnection = {
      connectionId: 'connection-gmail',
      displayName: 'Gmail default',
      isDefault: true,
      serviceId: 'gmail',
      status: 'active',
    }
    const botConnection = {
      connectionId: 'connection-bot',
      displayName: 'Bot default',
      isDefault: true,
      serviceId: 'bot',
      status: 'active',
    }
    const actions = {
      'gmail.fetch': {
        actionId: 'gmail.fetch',
        defaultConnection: gmailConnection,
        description: 'Fetch email.',
        inputs: { query: { jsonSchema: { type: 'string' }, nullable: true, value: null } },
        name: 'Fetch email',
        outputs: { messages: { jsonSchema: { items: { type: 'object' }, type: 'array' }, nullable: false } },
        serviceId: 'gmail',
        serviceName: 'Gmail',
      },
      'bot.send': {
        actionId: 'bot.send',
        defaultConnection: botConnection,
        description: 'Send notification.',
        inputs: { text: { jsonSchema: { type: 'string' }, nullable: false } },
        name: 'Send notification',
        outputs: {},
        serviceId: 'bot',
        serviceName: 'Bot',
      },
    }
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') return Response.json(draftRevision())
      if (path == '/v1/projects/project-1/connector/actions/gmail.fetch') {
        return Response.json({ action: actions['gmail.fetch'], projectId: 'project-1', version: 1 })
      }
      if (path == '/v1/projects/project-1/connector/actions/bot.send') {
        return Response.json({ action: actions['bot.send'], projectId: 'project-1', version: 1 })
      }
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      if (path == '/v1/projects/project-1/revisions/revision-2/flows/flow-1/check') {
        return Response.json({
          closureDigest: 'closure-2',
          diagnostics: [],
          engineContract: 'open-flow-engine/v1',
          flowId: 'flow-1',
          modelVersion: 1,
          projectId: 'project-1',
          revisionDigest: 'digest-revision-2',
          revisionId: 'revision-2',
          valid: true,
          version: 1,
        })
      }
      throw new Error(path)
    })
    const spec = JSON.stringify({
      edges: [
        { input: 'messages', output: 'messages', source: 'gmail', target: 'format' },
        { input: 'text', output: 'text', source: 'format', target: 'feishu' },
        { input: 'input', output: 'text', source: 'format', target: 'assess' },
      ],
      nodes: {
        gmail: { action: 'gmail.fetch', inputs: { query: 'is:unread' }, kind: 'connector', name: 'Fetch unread Gmail' },
        format: {
          code: '@format.js',
          inputs: {
            messages: { description: 'Gmail messages.', jsonSchema: { type: 'array' }, nullable: false },
          },
          kind: 'code',
          name: 'Format Gmail notification',
          outputs: {
            text: { description: 'Formatted notification.', jsonSchema: { type: 'string' }, nullable: false },
          },
        },
        feishu: { action: 'bot.send', connection: 'default', kind: 'connector', name: 'Notify Feishu' },
        assess: {
          inputs: {
            model: { model: 'deepseek-v4-flash', temperature: 0 },
            template: [
              { content: 'Decide whether this message needs a reply and return JSON.', role: 'system' },
              { content: '{{input}}', role: 'user' },
            ],
          },
          kind: 'llm-json',
          name: 'Assess reply need',
          outputs: {
            output: {
              description: 'Reply assessment.',
              jsonSchema: {
                additionalProperties: false,
                properties: { needsReply: { type: 'boolean' } },
                required: ['needsReply'],
                type: 'object',
              },
              nullable: false,
            },
          },
        },
      },
      version: 1,
    })
    const output = runtime(
      {},
      { files: { 'flow.json': spec, 'format.js': 'export default function run(input) { return { text: String(input.messages) } }\n' } },
    )

    await expect(
      runCli(
        ['apply', 'Main', '--file', 'flow.json', '--expected-revision', 'revision-1', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        output.value,
      ),
    ).resolves.toBe(0)

    const mutations = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutations).toHaveLength(1)
    const body = JSON.parse(String(mutations[0]!.init?.body))
    expect(body.expectedRevisionId).toBe('revision-1')
    expect(body.operations.map(({ kind }: { readonly kind: string }) => kind)).toEqual([
      'task.create',
      'graph.node.create',
      'module.create',
      'graph.node.create',
      'task.create',
      'graph.node.create',
      'task.create',
      'graph.node.create',
      'graph.edge.connect',
      'graph.edge.connect',
      'graph.edge.connect',
    ])
    expect(body.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'graph.node.create',
          node: expect.objectContaining({
            inputs: {},
            task: expect.objectContaining({
              inputs: {
                messages: { description: 'Gmail messages.', jsonSchema: { type: 'array' }, nullable: false },
              },
              outputs: {
                text: { description: 'Formatted notification.', jsonSchema: { type: 'string' }, nullable: false },
              },
            }),
          }),
        }),
        expect.objectContaining({
          kind: 'module.create',
          module: expect.objectContaining({ source: 'export default function run(input) { return { text: String(input.messages) } }\n' }),
        }),
        expect.objectContaining({
          kind: 'task.create',
          task: expect.objectContaining({ executor: expect.objectContaining({ connectionId: 'connection-gmail' }) }),
        }),
        expect.objectContaining({
          kind: 'task.create',
          task: expect.objectContaining({ executor: expect.objectContaining({ connectionId: 'connection-bot' }) }),
        }),
        expect.objectContaining({
          kind: 'task.create',
          task: {
            executor: { kind: 'llm', mode: 'json' },
            inputs: expect.objectContaining({
              input: expect.objectContaining({ value: 'Alex' }),
              model: expect.objectContaining({ value: { model: 'deepseek-v4-flash', temperature: 0 } }),
              template: expect.objectContaining({
                value: [
                  { content: 'Decide whether this message needs a reply and return JSON.', role: 'system' },
                  { content: '{{input}}', role: 'user' },
                ],
              }),
            }),
            name: 'Assess reply need',
            outputs: {
              output: {
                description: 'Reply assessment.',
                jsonSchema: {
                  additionalProperties: false,
                  properties: { needsReply: { type: 'boolean' } },
                  required: ['needsReply'],
                  type: 'object',
                },
                nullable: false,
              },
            },
          },
        }),
        expect.objectContaining({ edge: expect.objectContaining({ targetHandle: 'input' }), kind: 'graph.edge.connect' }),
      ]),
    )
    expect(JSON.parse(output.stdout())).toMatchObject({
      check: { valid: true },
      edges: [
        { sourceReference: 'gmail', targetReference: 'format' },
        { sourceReference: 'format', targetReference: 'feishu' },
        { sourceReference: 'format', targetReference: 'assess' },
      ],
      kind: 'flow.apply',
      nodes: [
        { connection: gmailConnection, reference: 'gmail' },
        { moduleId: expect.any(String), reference: 'format' },
        { connection: botConnection, reference: 'feishu' },
        { reference: 'assess', taskId: expect.any(String) },
      ],
      revision: { revisionId: 'revision-2' },
    })

    const invalidOutput = runtime(
      {},
      {
        files: {
          'invalid-llm.json': JSON.stringify({
            nodes: { assess: { inputs: { prompt: 'Invented handle' }, kind: 'llm-json', name: 'Assess' } },
            version: 1,
          }),
        },
      },
    )
    await expect(
      runCli(
        ['apply', 'Main', '--file', 'invalid-llm.json', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        invalidOutput.value,
      ),
    ).resolves.toBe(1)
    expect(JSON.parse(invalidOutput.stderr())).toMatchObject({ error: { code: 'flow.apply-invalid', message: expect.stringContaining('prompt') } })
    expect(requests.filter(({ path }) => path.endsWith('/draft/changes'))).toHaveLength(1)

    const invalidOutputHandle = runtime(
      {},
      {
        files: {
          'invalid-llm-output.json': JSON.stringify({
            nodes: {
              assess: {
                kind: 'llm-json',
                name: 'Assess',
                outputs: { result: { jsonSchema: {}, nullable: false } },
              },
            },
            version: 1,
          }),
        },
      },
    )
    await expect(
      runCli(
        ['apply', 'Main', '--file', 'invalid-llm-output.json', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        invalidOutputHandle.value,
      ),
    ).resolves.toBe(1)
    expect(JSON.parse(invalidOutputHandle.stderr())).toMatchObject({ error: { code: 'flow.apply-invalid', message: expect.stringContaining('result') } })
    expect(requests.filter(({ path }) => path.endsWith('/draft/changes'))).toHaveLength(1)

    const invalidLlmInputs = [{ input: 42 }, { messages: {} }, { messages: [null] }, { model: [] }, { template: [] }, { template: [null] }]
    for (const [index, inputs] of invalidLlmInputs.entries()) {
      const invalidInput = runtime(
        {},
        {
          files: {
            [`invalid-llm-input-${index}.json`]: JSON.stringify({ nodes: { assess: { inputs, kind: 'llm-json', name: 'Assess' } }, version: 1 }),
          },
        },
      )
      await expect(
        runCli(
          ['apply', 'Main', '--file', `invalid-llm-input-${index}.json`, '--project', 'project-1', '--json'],
          { request: request, getProject: async () => undefined, setProject: async () => {} },
          invalidInput.value,
        ),
      ).resolves.toBe(1)
      expect(JSON.parse(invalidInput.stderr())).toMatchObject({ error: { code: 'flow.apply-invalid' } })
    }
    expect(requests.filter(({ path }) => path.endsWith('/draft/changes'))).toHaveLength(1)

    const booleanSchemas = runtime(
      {},
      {
        files: {
          'boolean-schemas.json': JSON.stringify({
            nodes: {
              schema: {
                code: '@schema.js',
                inputs: { any: { jsonSchema: true, nullable: false } },
                kind: 'code',
                name: 'Boolean schemas',
                outputs: { never: { jsonSchema: false, nullable: false } },
              },
            },
            version: 1,
          }),
          'schema.js': 'export default function run(input) { return { never: input.any } }\n',
        },
      },
    )
    await expect(
      runCli(
        ['apply', 'Main', '--file', 'boolean-schemas.json', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        booleanSchemas.value,
      ),
    ).resolves.toBe(0)
    const booleanSchemaMutation = requests.findLast(({ path }) => path.endsWith('/draft/changes'))
    expect(JSON.parse(String(booleanSchemaMutation?.init?.body)).operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'graph.node.create',
          node: expect.objectContaining({
            task: expect.objectContaining({
              inputs: { any: { jsonSchema: true, nullable: false } },
              outputs: { never: { jsonSchema: false, nullable: false } },
            }),
          }),
        }),
      ]),
    )
  })

  it('applies a provider Trigger and its first Edge with one Draft CAS write', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const definition = {
      configSchema: { properties: { owner: { type: 'string' } }, required: ['owner'], type: 'object' },
      definitionVersion: 1,
      description: 'Poll a repository.',
      displayName: 'Repository Poll',
      key: 'github.repository_poll',
      name: 'repository_poll',
      payloadSchema: { type: 'object' },
      provider: 'github',
      type: 'poll',
    }
    const connection = {
      connectionId: 'connection-github',
      displayName: 'GitHub default',
      isDefault: true,
      serviceId: 'github',
      status: 'active',
    }
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') return Response.json(draftRevision())
      if (path == `/v1/trigger-keys/${definition.key}`) return Response.json({ definition, version: 1 })
      if (path == '/v1/projects/project-1/connector/connections/github') {
        return Response.json({ connections: [connection], projectId: 'project-1', serviceId: 'github', version: 1 })
      }
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      if (path == '/v1/projects/project-1/revisions/revision-2/flows/flow-1/check') {
        return Response.json({
          closureDigest: 'closure-2',
          diagnostics: [],
          engineContract: 'open-flow-engine/v1',
          flowId: 'flow-1',
          modelVersion: 1,
          projectId: 'project-1',
          revisionDigest: 'digest-revision-2',
          revisionId: 'revision-2',
          valid: true,
          version: 1,
        })
      }
      throw new Error(path)
    })
    const spec = {
      edges: [{ input: 'value', output: 'payload', source: 'incoming', target: 'capture' }],
      nodes: { capture: { kind: 'value', name: 'Capture payload' } },
      triggers: {
        incoming: {
          config: { owner: 'oomol' },
          connection: 'default',
          every: '10m',
          key: definition.key,
          kind: 'provider',
          name: 'Watch repository',
        },
      },
      version: 1,
    }
    const output = runtime({}, { files: { 'flow.json': JSON.stringify(spec) } })
    const invalidOutput = runtime(
      { OO_FLOW_PROJECT: 'project-1' },
      { files: { 'invalid.json': JSON.stringify({ ...spec, edges: [{ ...spec.edges[0], output: 'invalid' }] }) } },
    )

    await expect(
      runCli(
        ['apply', 'Main', '--file', 'flow.json', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        output.value,
      ),
    ).resolves.toBe(0)

    const mutations = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutations).toHaveLength(1)
    const body = JSON.parse(String(mutations[0]!.init?.body))
    expect(body.operations.map(({ kind }: { readonly kind: string }) => kind)).toEqual([
      'graph.node.create',
      'binding.create',
      'graph.node.create',
      'graph.edge.connect',
    ])
    expect(body.operations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ binding: { kind: 'connection', target: connection.connectionId }, kind: 'binding.create' }),
        expect.objectContaining({
          kind: 'graph.node.create',
          node: expect.objectContaining({
            config: { owner: 'oomol' },
            name: 'Watch repository',
            pollTimes: [{ type: 'every', unit: 'minute', value: 10 }],
          }),
        }),
        expect.objectContaining({
          edge: expect.objectContaining({ sourceHandle: 'payload', targetHandle: 'value' }),
          kind: 'graph.edge.connect',
        }),
      ]),
    )
    expect(JSON.parse(output.stdout())).toMatchObject({
      check: { valid: true },
      edges: [{ sourceReference: 'incoming', targetReference: 'capture' }],
      kind: 'flow.apply',
      nodes: [{ reference: 'capture' }],
      revision: { revisionId: 'revision-2' },
      triggers: [
        {
          connection,
          connectionId: connection.connectionId,
          key: definition.key,
          reference: 'incoming',
          triggerKind: 'poll',
        },
      ],
    })
    await expect(
      runCli(
        ['apply', 'Main', '--file', 'invalid.json', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        invalidOutput.value,
      ),
    ).resolves.toBe(1)
    expect(JSON.parse(invalidOutput.stderr())).toMatchObject({ error: { code: 'trigger.output-not-found' } })
    expect(requests.filter(({ path }) => path.endsWith('/draft/changes'))).toHaveLength(1)
  })

  it('reports the accepted Revision without inviting a retry when the post-apply check fails', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') return Response.json(draftRevision())
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      if (path == '/v1/projects/project-1/revisions/revision-2/flows/flow-1/check') throw new Error('check unavailable')
      throw new Error(path)
    })
    const output = runtime({}, { files: { 'flow.json': JSON.stringify({ edges: [], nodes: { value: { kind: 'value', name: 'Value' } }, version: 1 }) } })

    await expect(
      runCli(
        ['apply', 'Main', '--file', 'flow.json', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        output.value,
      ),
    ).resolves.toBe(1)

    expect(requests.filter(({ path }) => path.endsWith('/draft/changes'))).toHaveLength(1)
    expect(JSON.parse(output.stdout())).toMatchObject({
      check: { status: 'unavailable' },
      kind: 'flow.apply',
      revision: { revisionId: 'revision-2' },
    })
    expect(JSON.parse(output.stderr())).toMatchObject({
      error: {
        code: 'flow.apply-check-failed',
        details: { revisionId: 'revision-2' },
        message: expect.stringContaining('Do not retry'),
      },
    })
  })

  it('rejects a stale flow apply request before reading its file or writing the Draft', async () => {
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') return Response.json(draftRevision())
      throw new Error(path)
    })
    const output = runtime()

    await expect(
      runCli(
        ['apply', 'Main', '--file', 'missing.json', '--expected-revision', 'revision-old', '--project', 'project-1', '--json'],
        { request: request, getProject: async () => undefined, setProject: async () => {} },
        output.value,
      ),
    ).resolves.toBe(1)

    expect(JSON.parse(output.stderr())).toMatchObject({ error: { code: 'project.revision-conflict' } })
    expect(request.mock.calls.some(([path]) => String(path).endsWith('/draft/changes'))).toBe(false)
  })

  it('adds, updates, and removes Nodes with one shared atomic change set per action', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const value = { concurrency: 1, inputs: {}, kind: 'value', name: 'Existing', values: { value: { jsonSchema: {}, nullable: true, value: null } } }
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') return Response.json(draftRevision({ existing: value }))
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const add = runtime({}, { files: { 'script.js': "import './shared.mjs'\nexport default function run() { return { result: 1 } }\n" } })
    const set = runtime()
    const remove = runtime()

    await expect(runCli(['node', 'add', 'Main', 'code', 'Script', '--code', '@script.js', '--project', 'project-1', '--json'], host, add.value)).resolves.toBe(
      0,
    )
    await expect(
      runCli(
        ['node', 'set', 'Main', 'Existing', '--name', 'Renamed', '--concurrency', '2', '--timeout', '1000', '--project', 'project-1', '--json'],
        host,
        set.value,
      ),
    ).resolves.toBe(0)
    await expect(runCli(['node', 'remove', 'Main', 'existing', '--yes', '--project', 'project-1', '--json'], host, remove.value)).resolves.toBe(0)

    const mutations = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutations).toHaveLength(3)
    expect(mutations.map(({ init }) => new Headers(init?.headers).has('idempotency-key'))).toEqual([false, false, false])
    const added = JSON.parse(String(mutations[0]!.init?.body))
    expect(added.operations.map(({ kind }: { readonly kind: string }) => kind)).toEqual(['module.create', 'graph.node.create'])
    expect(added.operations[0]).toMatchObject({
      kind: 'module.create',
      module: {
        imports: ['shared'],
        source: "import './shared.mjs'\nexport default function run() { return { result: 1 } }\n",
      },
    })
    expect(JSON.parse(String(mutations[1]!.init?.body))).toMatchObject({
      expectedRevisionId: 'revision-1',
      operations: [{ kind: 'graph.node.replace', node: { concurrency: 2, name: 'Renamed', timeoutMs: 1000 }, nodeId: 'existing' }],
    })
    expect(JSON.parse(String(mutations[2]!.init?.body))).toMatchObject({ operations: [{ kind: 'graph.node.delete', nodeId: 'existing' }] })
    const addedOutput = JSON.parse(add.stdout()) as { readonly target: Record<string, unknown> }
    expect(addedOutput).toMatchObject({
      kind: 'node.add',
      revision: { revisionId: 'revision-2' },
      target: { moduleId: expect.any(String), nodeId: expect.any(String) },
    })
    expect(addedOutput.target).not.toHaveProperty('taskId')
    expect(JSON.parse(set.stdout())).toMatchObject({ kind: 'node.set', revision: { revisionId: 'revision-2' } })
    expect(JSON.parse(remove.stdout())).toMatchObject({ kind: 'node.remove', revision: { revisionId: 'revision-2' } })
  })

  it('connects and disconnects exact Node handles without writing no-op changes', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    let connected = false
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') {
        return Response.json(
          draftRevision({
            source: { concurrency: 1, inputs: {}, kind: 'value', name: 'Source', values: { result: { jsonSchema: {}, nullable: true } } },
            target: {
              cases: [],
              concurrency: 1,
              input: { handle: 'value', jsonSchema: {}, nullable: true },
              inputs: connected ? { value: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'source', output: 'result' }] } } : {},
              kind: 'condition',
              name: 'Target',
            },
          }),
        )
      }
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const connect = runtime()
    const unchanged = runtime()
    const disconnect = runtime()

    await expect(runCli(['connect', 'Main', 'Source', 'result', 'Target', 'value', '--project', 'project-1', '--json'], host, connect.value)).resolves.toBe(0)
    connected = true
    await expect(runCli(['connect', 'Main', 'source', 'result', 'target', 'value', '--project', 'project-1', '--json'], host, unchanged.value)).resolves.toBe(0)
    await expect(
      runCli(['disconnect', 'Main', 'source', 'result', 'target', 'value', '--project', 'project-1', '--json'], host, disconnect.value),
    ).resolves.toBe(0)

    const mutations = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutations).toHaveLength(2)
    expect(JSON.parse(String(mutations[0]!.init?.body))).toMatchObject({
      operations: [{ edge: { source: 'source', sourceHandle: 'result', target: 'target', targetHandle: 'value' }, kind: 'graph.edge.connect' }],
    })
    expect(JSON.parse(String(mutations[1]!.init?.body))).toMatchObject({
      operations: [{ edge: { source: 'source', sourceHandle: 'result', target: 'target', targetHandle: 'value' }, kind: 'graph.edge.disconnect' }],
    })
    expect(JSON.parse(unchanged.stdout())).toMatchObject({ changed: false, kind: 'edge.connect', revisionId: 'revision-1' })
  })

  it('connects and disconnects a Trigger payload by name or ID', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    let connected = false
    const trigger = {
      bindingId: 'binding-gmail',
      config: {},
      definition: {
        configSchema: { type: 'object' },
        definitionVersion: 1,
        description: 'Poll Gmail.',
        displayName: 'Gmail poll',
        key: 'gmail.on_message_received',
        name: 'on_message_received',
        payloadSchema: { type: 'object' },
        provider: 'gmail',
        type: 'poll',
      },
      kind: 'poll',
      name: 'Gmail poll',
      pollTimes: [{ type: 'every', unit: 'minute', value: 1 }],
    }
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') {
        return Response.json(
          draftRevision(
            {
              'target': {
                cases: [],
                concurrency: 1,
                input: { handle: 'value', jsonSchema: {}, nullable: true },
                inputs: connected ? { value: { kind: 'sources', sources: [{ kind: 'node', nodeId: 'trigger-gmail', output: 'payload' }] } } : {},
                kind: 'condition',
                name: 'Target',
              },
              'trigger-gmail': trigger,
            },
            {},
            {
              bindings: { 'binding-gmail': { kind: 'connection', target: 'connection-gmail' } },
            },
          ),
        )
      }
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const connect = runtime()
    const unchanged = runtime()
    const disconnect = runtime()

    await expect(
      runCli(['connect', 'Main', 'Gmail poll', 'payload', 'Target', 'value', '--project', 'project-1', '--json'], host, connect.value),
    ).resolves.toBe(0)
    connected = true
    await expect(
      runCli(['connect', 'Main', 'trigger-gmail', 'payload', 'target', 'value', '--project', 'project-1', '--json'], host, unchanged.value),
    ).resolves.toBe(0)
    await expect(
      runCli(['disconnect', 'Main', 'trigger-gmail', 'payload', 'target', 'value', '--project', 'project-1', '--json'], host, disconnect.value),
    ).resolves.toBe(0)

    const mutations = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutations).toHaveLength(2)
    expect(JSON.parse(String(mutations[0]!.init?.body))).toMatchObject({
      operations: [
        {
          edge: { source: 'trigger-gmail', sourceHandle: 'payload', target: 'target', targetHandle: 'value' },
          kind: 'graph.edge.connect',
          target: { id: 'flow-1', kind: 'flow' },
        },
      ],
    })
    expect(JSON.parse(String(mutations[1]!.init?.body))).toMatchObject({
      operations: [
        {
          edge: { source: 'trigger-gmail', sourceHandle: 'payload', target: 'target', targetHandle: 'value' },
          kind: 'graph.edge.disconnect',
          target: { id: 'flow-1', kind: 'flow' },
        },
      ],
    })
    expect(JSON.parse(unchanged.stdout())).toMatchObject({ changed: false, edge: { source: 'trigger-gmail', sourceHandle: 'payload' } })
  })

  it('discovers Connector resources and writes one atomic change for add and set', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const defaultConnection = {
      connectionId: 'connection-default',
      displayName: 'Team default',
      isDefault: true,
      serviceId: 'github',
      status: 'active',
    }
    const action = {
      actionId: 'github.create_issue',
      defaultConnection,
      description: 'Create an issue.',
      inputs: {
        labels: { jsonSchema: { items: { type: 'string' }, type: 'array' }, nullable: false, value: [] },
        title: { jsonSchema: { type: 'string' }, nullable: false },
      },
      name: 'Create issue',
      outputs: { issue: { jsonSchema: { type: 'object' }, nullable: false } },
      serviceId: 'github',
      serviceName: 'GitHub',
    }
    const connections = [defaultConnection, { connectionId: 'connection-work', displayName: 'Work', isDefault: false, serviceId: 'github', status: 'active' }]
    const existingNode = {
      concurrency: 1,
      inputs: { title: { kind: 'value', value: 'Old title' } },
      kind: 'task',
      name: 'Existing action',
      taskId: 'task-existing',
    }
    const existingTask = {
      executor: { action: action.actionId, connectionId: defaultConnection.connectionId, kind: 'connector' },
      inputs: action.inputs,
      name: 'Existing action',
      outputs: action.outputs,
    }
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') {
        return Response.json(draftRevision({ existing: existingNode }, {}, { tasks: { 'task-existing': existingTask } }))
      }
      if (path == '/v1/projects/project-1/connector/connections/github') {
        return Response.json({ connections, projectId: 'project-1', serviceId: 'github', version: 1 })
      }
      if (path == '/v1/projects/project-1/connector/actions' || path.startsWith('/v1/projects/project-1/connector/actions?q=')) {
        return Response.json({ actions: [action], projectId: 'project-1', version: 1 })
      }
      if (path == `/v1/projects/project-1/connector/actions/${action.actionId}`) {
        return Response.json({ action, projectId: 'project-1', version: 1 })
      }
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const list = runtime()
    const search = runtime()
    const show = runtime()
    const listConnections = runtime()
    const add = runtime()
    const set = runtime({}, { files: { 'labels.json': '["bug","urgent"]' } })

    await expect(runCli(['connector', 'list', '--project', 'project-1', '--json'], host, list.value)).resolves.toBe(0)
    await expect(runCli(['connector', 'search', 'Create issue', '--project', 'project-1', '--json'], host, search.value)).resolves.toBe(0)
    await expect(runCli(['connector', 'show', action.actionId, '--project', 'project-1', '--json'], host, show.value)).resolves.toBe(0)
    await expect(runCli(['connector', 'connections', 'github', '--project', 'project-1', '--json'], host, listConnections.value)).resolves.toBe(0)
    await expect(
      runCli(['connector', 'add', 'Main', action.actionId, '--name', 'New issue', '--set', 'title=true', '--project', 'project-1', '--json'], host, add.value),
    ).resolves.toBe(0)
    await expect(
      runCli(
        [
          'connector',
          'set',
          'Main',
          'existing',
          '--connection',
          'Work',
          '--set',
          'title=Updated title',
          '--set',
          'labels=@labels.json',
          '--project',
          'project-1',
          '--json',
        ],
        host,
        set.value,
      ),
    ).resolves.toBe(0)

    const listed = JSON.parse(list.stdout())
    expect(listed).toMatchObject({ actions: [{ actionId: action.actionId }], kind: 'connector.list' })
    expect(listed.actions[0]).not.toHaveProperty('inputs')
    expect(listed.actions[0]).not.toHaveProperty('outputs')
    expect(JSON.parse(search.stdout())).toMatchObject({ kind: 'connector.search', query: 'Create issue' })
    expect(JSON.parse(show.stdout())).toMatchObject({ action: { actionId: action.actionId }, kind: 'connector.show' })
    expect(JSON.parse(listConnections.stdout())).toMatchObject({
      connections: [{ connectionId: 'connection-default' }, { connectionId: 'connection-work' }],
      kind: 'connector.connections',
    })
    const mutations = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutations).toHaveLength(2)
    expect(JSON.parse(String(mutations[0]!.init?.body))).toMatchObject({
      operations: [
        {
          kind: 'task.create',
          task: { executor: { action: action.actionId, connectionId: 'connection-default', kind: 'connector' }, inputs: { title: { value: 'true' } } },
        },
        { kind: 'graph.node.create', node: { inputs: { labels: { value: [] }, title: { value: 'true' } } } },
      ],
    })
    expect(JSON.parse(String(mutations[1]!.init?.body))).toMatchObject({
      operations: [
        { kind: 'task.replace', task: { executor: { connectionId: 'connection-work' } }, taskId: 'task-existing' },
        {
          kind: 'graph.node.replace',
          node: { inputs: { labels: { value: ['bug', 'urgent'] }, title: { value: 'Updated title' } } },
          nodeId: 'existing',
        },
      ],
    })
    expect(JSON.parse(add.stdout())).toMatchObject({
      connection: { connectionId: 'connection-default', displayName: 'Team default' },
      connectionId: 'connection-default',
      kind: 'connector.add',
    })
    expect(JSON.parse(set.stdout())).toMatchObject({ connectionId: 'connection-work', kind: 'connector.set' })
  })

  it('discovers and authors provider Triggers without accepting a caller-supplied definition', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const definition = {
      configSchema: { properties: { owner: { type: 'string' } }, required: ['owner'], type: 'object' },
      definitionVersion: 1,
      description: 'Poll a repository.',
      displayName: 'Repository Poll',
      key: 'github.repository_poll',
      name: 'repository_poll',
      payloadSchema: { type: 'object' },
      provider: 'github',
      type: 'poll',
    }
    const summary = (({ configSchema: _configSchema, definitionVersion: _definitionVersion, payloadSchema: _payloadSchema, ...value }) => value)(definition)
    const connection = {
      connectionId: 'connection-work',
      displayName: 'GitHub Team',
      isDefault: true,
      serviceId: 'github',
      status: 'active',
    }
    const existingTrigger = {
      bindingId: 'binding-existing',
      config: { owner: 'old' },
      definition,
      kind: 'poll',
      name: 'Existing poll',
      pollTimes: [{ type: 'every', unit: 'minute', value: 5 }],
    }
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/flows') return Response.json({ flows: [flow()], projectId: 'project-1', version: 1 })
      if (path == '/v1/projects/project-1/revisions/revision-1') {
        return Response.json(
          draftRevision(
            { 'trigger-existing': existingTrigger },
            {},
            {
              bindings: { 'binding-existing': { kind: 'connection', target: 'connection-old' } },
            },
          ),
        )
      }
      if (path == '/v1/trigger-keys') return Response.json({ keys: [summary], version: 1 })
      if (path == `/v1/trigger-keys/${definition.key}`) return Response.json({ definition, version: 1 })
      if (path == '/v1/projects/project-1/connector/connections/github') {
        return Response.json({ connections: [connection], projectId: 'project-1', serviceId: 'github', version: 1 })
      }
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const search = runtime()
    const show = runtime()
    const list = runtime()
    const add = runtime()
    const unchanged = runtime()
    const set = runtime()
    const remove = runtime()

    await expect(runCli(['trigger', 'search', 'repository', '--project', 'project-1', '--json'], host, search.value)).resolves.toBe(0)
    await expect(runCli(['trigger', 'show', definition.key, '--project', 'project-1', '--json'], host, show.value)).resolves.toBe(0)
    await expect(runCli(['trigger', 'list', 'Main', '--project', 'project-1', '--json'], host, list.value)).resolves.toBe(0)
    await expect(
      runCli(
        [
          'trigger',
          'add',
          'Main',
          definition.key,
          '--name',
          'New poll',
          '--connection',
          'GitHub Team',
          '--set',
          'owner=oomol',
          '--every',
          '10m',
          '--project',
          'project-1',
          '--json',
        ],
        host,
        add.value,
      ),
    ).resolves.toBe(0)
    await expect(
      runCli(['trigger', 'set', 'Main', 'trigger-existing', '--set', 'owner=old', '--project', 'project-1', '--json'], host, unchanged.value),
    ).resolves.toBe(0)
    await expect(
      runCli(
        [
          'trigger',
          'set',
          'Main',
          'trigger-existing',
          '--connection',
          'GitHub Team',
          '--set',
          'owner=oomol',
          '--cron',
          '0 9 * * *',
          '--timezone',
          'Asia/Shanghai',
          '--project',
          'project-1',
          '--json',
        ],
        host,
        set.value,
      ),
    ).resolves.toBe(0)
    await expect(runCli(['trigger', 'remove', 'Main', 'trigger-existing', '--yes', '--project', 'project-1', '--json'], host, remove.value)).resolves.toBe(0)

    expect(JSON.parse(search.stdout())).toMatchObject({ definitions: [{ key: definition.key }], kind: 'trigger.search' })
    expect(JSON.parse(show.stdout())).toMatchObject({ definition: { configSchema: definition.configSchema, key: definition.key }, kind: 'trigger.show' })
    expect(JSON.parse(list.stdout())).toMatchObject({ kind: 'trigger.list', triggers: [{ triggerId: 'trigger-existing' }] })
    expect(JSON.parse(unchanged.stdout())).toMatchObject({ changed: false, kind: 'trigger.set', revisionId: 'revision-1' })
    const mutations = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutations).toHaveLength(3)
    expect(JSON.parse(String(mutations[0]!.init?.body))).toMatchObject({
      operations: [
        { binding: { kind: 'connection', target: 'connection-work' }, kind: 'binding.create' },
        {
          kind: 'graph.node.create',
          node: {
            config: { owner: 'oomol' },
            definition,
            kind: 'poll',
            name: 'New poll',
            pollTimes: [{ type: 'every', unit: 'minute', value: 10 }],
          },
          target: { id: 'flow-1', kind: 'flow' },
        },
      ],
    })
    expect(JSON.parse(String(mutations[1]!.init?.body))).toMatchObject({
      operations: [
        {
          kind: 'graph.node.replace',
          node: {
            bindingId: 'binding-existing',
            config: { owner: 'oomol' },
            definition,
            pollTimes: [{ expression: '0 9 * * *', timezone: 'Asia/Shanghai', type: 'cron' }],
          },
          nodeId: 'trigger-existing',
          target: { id: 'flow-1', kind: 'flow' },
        },
        { binding: { kind: 'connection', target: 'connection-work' }, bindingId: 'binding-existing', kind: 'binding.replace' },
      ],
    })
    expect(JSON.parse(String(mutations[2]!.init?.body))).toMatchObject({
      operations: [
        { kind: 'graph.node.delete', nodeId: 'trigger-existing', target: { id: 'flow-1', kind: 'flow' } },
        { bindingId: 'binding-existing', kind: 'binding.delete' },
      ],
    })
  })

  it('lists, reads, edits, and renames Project CodeModules while deriving imports from source', async () => {
    const requests: Array<{ readonly init?: RequestInit; readonly path: string }> = []
    const module = { imports: [], name: 'Code', source: 'export function run() { return 1 }\n' }
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      requests.push({ init, path })
      if (path == '/v1/projects/project-1') return Response.json(project())
      if (path == '/v1/projects/project-1/draft') return Response.json(draftRevision({}, { 'module-1': module }))
      if (path == '/v1/projects/project-1/draft/changes') {
        return Response.json({
          draftFlows: [{ closureDigest: 'closure-2', flowId: 'flow-1', name: 'Main' }],
          revision: revision('revision-2', 'revision-1'),
          version: 1,
        })
      }
      throw new Error(path)
    })
    const host = { request: request, getProject: async () => undefined, setProject: async () => {} }
    const list = runtime()
    const show = runtime()
    const unchanged = runtime()
    const edit = runtime({}, { files: { 'code.js': "import './z.mjs'\nimport './a.mjs'\nimport './z.mjs'\nexport function run() { return 2 }\n" } })
    const set = runtime()

    await expect(runCli(['code', 'list', '--project', 'project-1', '--json'], host, list.value)).resolves.toBe(0)
    await expect(runCli(['code', 'show', 'Code', '--project', 'project-1'], host, show.value)).resolves.toBe(0)
    await expect(runCli(['code', 'edit', 'Code', '--code', module.source, '--project', 'project-1', '--json'], host, unchanged.value)).resolves.toBe(0)
    await expect(runCli(['code', 'edit', 'module-1', '--code', '@code.js', '--project', 'project-1', '--json'], host, edit.value)).resolves.toBe(0)
    await expect(runCli(['code', 'set', 'module-1', '--name', 'Renamed', '--project', 'project-1', '--json'], host, set.value)).resolves.toBe(0)

    expect(JSON.parse(list.stdout())).toMatchObject({ kind: 'code.list', modules: [{ imports: [], moduleId: 'module-1', name: 'Code' }] })
    expect(show.stdout()).toBe(module.source)
    expect(JSON.parse(unchanged.stdout())).toMatchObject({ changed: false, kind: 'code.edit', revisionId: 'revision-1' })
    const mutations = requests.filter(({ path }) => path.endsWith('/draft/changes'))
    expect(mutations).toHaveLength(2)
    expect(JSON.parse(String(mutations[0]!.init?.body))).toMatchObject({
      operations: [{ imports: ['a', 'z'], kind: 'module.source.replace', moduleId: 'module-1' }],
    })
    expect(JSON.parse(String(mutations[1]!.init?.body))).toMatchObject({
      operations: [{ kind: 'module.rename', moduleId: 'module-1', name: 'Renamed' }],
    })
    expect(JSON.parse(edit.stdout())).toMatchObject({ imports: ['a', 'z'], kind: 'code.edit', revision: { revisionId: 'revision-2' } })
    expect(JSON.parse(set.stdout())).toMatchObject({ kind: 'code.set', name: 'Renamed', revision: { revisionId: 'revision-2' } })
  })
})
