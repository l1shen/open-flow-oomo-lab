import type { RevisionContent } from '@oomol-lab/open-flow/project-change'

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ServerService } from '../src/service.ts'

const directories: string[] = []
const services = new Set<ServerService>()

afterEach(async () => {
  await Promise.allSettled([...services].map((service) => service.close()))
  services.clear()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })))
})

async function databaseFile(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'open-flow-publication-'))
  directories.push(directory)
  return path.join(directory, 'open-flow.sqlite')
}

function revision(name = 'Incoming', webhook = true): RevisionContent {
  const message = { jsonSchema: { type: 'string' }, nullable: false } as const
  return {
    document: {
      bindings: {},
      flows: {
        main: {
          graph: {
            nodes: {
              marker: {
                concurrency: 1,
                inputs: {},
                kind: 'value',
                values: { ready: { jsonSchema: { type: 'boolean' }, nullable: false, value: true } },
              },
              ...(webhook
                ? {
                    incoming: {
                      inputsDef: [{ handle: 'message', ...message }],
                      kind: 'webhook' as const,
                      name,
                      options: { responseData: name, responseStatusCode: 202 },
                    },
                  }
                : {}),
            },
          },
          name: 'Main',
        },
      },
      subflows: {},
      tasks: {},
    },
    modelVersion: 1,
    modules: {},
  }
}

function publish(
  service: ServerService,
  input: {
    readonly expectedLivePublicationId: string | null
    readonly idempotencyKey: string
    readonly revision: RevisionContent
    readonly revisionId: string
  },
) {
  return service.publishFlow({
    ...input,
    flowId: 'main',
    projectId: 'project-a',
  })
}

describe('Server Publication and Webhook target', () => {
  it('publishes one immutable Live target without exposing deployment state', async () => {
    const service = ServerService.open(await databaseFile())
    services.add(service)
    const content = revision()
    const accepted = await publish(service, {
      expectedLivePublicationId: null,
      idempotencyKey: 'publish-first',
      revision: content,
      revisionId: 'revision-a',
    })
    if (accepted.kind != 'published') throw new Error('Initial Publication unexpectedly conflicted.')

    const endpointId = service.webhookEndpoint('project-a', 'main', 'incoming')
    expect(endpointId).toMatch(/^endpoint_[0-9a-f]{32}$/)
    const target = service.webhookTarget(endpointId!)
    expect(target).toMatchObject({
      endpointId,
      flowId: 'main',
      projectId: 'project-a',
      publicationId: accepted.publicationId,
      revision: content,
      revisionId: 'revision-a',
      runtimeVersion: 1,
      trigger: { kind: 'webhook', name: 'Incoming' },
      triggerNodeId: 'incoming',
    })
    expect(target?.closureDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(target?.revisionDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(Object.keys(target!).toSorted()).toEqual([
      'closureDigest',
      'endpointId',
      'engineContract',
      'flowId',
      'projectId',
      'publicationId',
      'revision',
      'revisionDigest',
      'revisionId',
      'runtimeVersion',
      'trigger',
      'triggerNodeId',
    ])
    expect(service.webhookTarget('endpoint_00000000000000000000000000000000')).toBeUndefined()
  })

  it('deduplicates concurrent Publish and rejects a conflicting idempotency key', async () => {
    const service = ServerService.open(await databaseFile())
    services.add(service)
    const input = {
      expectedLivePublicationId: null,
      idempotencyKey: 'publish-once',
      revision: revision(),
      revisionId: 'revision-a',
    } as const

    const [first, second] = await Promise.all([publish(service, input), publish(service, input)])
    if (first.kind != 'published' || second.kind != 'published') throw new Error('Matching Publish requests unexpectedly conflicted.')
    expect(first.publicationId).toBe(second.publicationId)
    expect([first.created, second.created].toSorted()).toEqual([false, true])
    await expect(
      publish(service, {
        ...input,
        revision: revision('Different'),
        revisionId: 'revision-b',
      }),
    ).resolves.toEqual({ kind: 'conflict' })
  })

  it('moves Live with CAS while preserving endpoint identity and immutable operation replay', async () => {
    const service = ServerService.open(await databaseFile())
    services.add(service)
    const firstInput = {
      expectedLivePublicationId: null,
      idempotencyKey: 'publish-first',
      revision: revision(),
      revisionId: 'revision-a',
    } as const
    const first = await publish(service, firstInput)
    if (first.kind != 'published') throw new Error('Initial Publication unexpectedly conflicted.')
    const endpointId = service.webhookEndpoint('project-a', 'main', 'incoming')!

    await expect(
      publish(service, {
        expectedLivePublicationId: first.publicationId,
        idempotencyKey: 'revision-conflict',
        revision: revision('Conflicting revision identity'),
        revisionId: 'revision-a',
      }),
    ).rejects.toMatchObject({ code: 'revision-conflict' })
    expect(service.webhookTarget(endpointId)?.runtimeVersion).toBe(1)

    const second = await publish(service, {
      expectedLivePublicationId: first.publicationId,
      idempotencyKey: 'publish-second',
      revision: revision('Updated'),
      revisionId: 'revision-b',
    })
    if (second.kind != 'published') throw new Error('Second Publication unexpectedly conflicted.')
    expect(service.webhookEndpoint('project-a', 'main', 'incoming')).toBe(endpointId)
    expect(service.webhookTarget(endpointId)).toMatchObject({
      publicationId: second.publicationId,
      revisionId: 'revision-b',
      runtimeVersion: 2,
      trigger: { name: 'Updated' },
    })

    await expect(publish(service, firstInput)).resolves.toEqual({ created: false, kind: 'published', publicationId: first.publicationId })
    expect(service.webhookTarget(endpointId)?.publicationId).toBe(second.publicationId)
    await expect(
      publish(service, {
        expectedLivePublicationId: first.publicationId,
        idempotencyKey: 'publish-stale',
        revision: revision('Stale'),
        revisionId: 'revision-c',
      }),
    ).rejects.toMatchObject({ code: 'publication-live-conflict' })
    expect(service.webhookTarget(endpointId)).toMatchObject({ publicationId: second.publicationId, runtimeVersion: 2 })
  })

  it('retires and restores the same endpoint across a SQLite reopen', async () => {
    const file = await databaseFile()
    let service = ServerService.open(file)
    services.add(service)
    const first = await publish(service, {
      expectedLivePublicationId: null,
      idempotencyKey: 'publish-first',
      revision: revision(),
      revisionId: 'revision-a',
    })
    if (first.kind != 'published') throw new Error('Initial Publication unexpectedly conflicted.')
    const endpointId = service.webhookEndpoint('project-a', 'main', 'incoming')!

    const retired = await publish(service, {
      expectedLivePublicationId: first.publicationId,
      idempotencyKey: 'publish-retired',
      revision: revision('Removed', false),
      revisionId: 'revision-b',
    })
    if (retired.kind != 'published') throw new Error('Retirement Publication unexpectedly conflicted.')
    expect(service.webhookEndpoint('project-a', 'main', 'incoming')).toBeUndefined()
    expect(service.webhookTarget(endpointId)).toBeUndefined()

    const restored = await publish(service, {
      expectedLivePublicationId: retired.publicationId,
      idempotencyKey: 'publish-restored',
      revision: revision('Restored'),
      revisionId: 'revision-c',
    })
    if (restored.kind != 'published') throw new Error('Restored Publication unexpectedly conflicted.')
    expect(service.webhookEndpoint('project-a', 'main', 'incoming')).toBe(endpointId)
    expect(service.webhookTarget(endpointId)).toMatchObject({ publicationId: restored.publicationId, runtimeVersion: 3 })

    await service.close()
    services.delete(service)
    service = ServerService.open(file)
    services.add(service)
    expect(service.webhookEndpoint('project-a', 'main', 'incoming')).toBe(endpointId)
    expect(service.webhookTarget(endpointId)).toMatchObject({
      publicationId: restored.publicationId,
      revisionId: 'revision-c',
      runtimeVersion: 3,
      trigger: { name: 'Restored' },
    })
  })

  it('rejects a resolved target that becomes stale before Run admission', async () => {
    const service = ServerService.open(await databaseFile())
    services.add(service)
    const first = await publish(service, {
      expectedLivePublicationId: null,
      idempotencyKey: 'publish-first',
      revision: revision(),
      revisionId: 'revision-a',
    })
    if (first.kind != 'published') throw new Error('Initial Publication unexpectedly conflicted.')
    const endpointId = service.webhookEndpoint('project-a', 'main', 'incoming')!
    const stale = service.webhookTarget(endpointId)!

    const second = await publish(service, {
      expectedLivePublicationId: first.publicationId,
      idempotencyKey: 'publish-second',
      revision: revision('Updated'),
      revisionId: 'revision-b',
    })
    if (second.kind != 'published') throw new Error('Second Publication unexpectedly conflicted.')

    await expect(service.acceptWebhookTarget(stale, 'delivery-during-publish', { message: 'hello' })).resolves.toBeUndefined()
    const accepted = await service.acceptWebhookTarget(service.webhookTarget(endpointId)!, 'delivery-during-publish', { message: 'hello' })
    expect(accepted).toMatchObject({ created: true, kind: 'accepted', status: 'queued' })
  })

  it('rejects an invalid target before creating any publication state', async () => {
    const service = ServerService.open(await databaseFile())
    services.add(service)
    await expect(
      service.publishFlow({
        expectedLivePublicationId: null,
        flowId: 'missing',
        idempotencyKey: 'publish-invalid',
        projectId: 'project-a',
        revision: revision(),
        revisionId: 'revision-invalid',
      }),
    ).rejects.toMatchObject({ code: 'flow-not-found' })

    const accepted = await publish(service, {
      expectedLivePublicationId: null,
      idempotencyKey: 'publish-valid',
      revision: revision(),
      revisionId: 'revision-a',
    })
    expect(accepted).toMatchObject({ created: true, kind: 'published' })
    expect(service.webhookTarget(service.webhookEndpoint('project-a', 'main', 'incoming')!)).toMatchObject({ runtimeVersion: 1 })
  })
})
