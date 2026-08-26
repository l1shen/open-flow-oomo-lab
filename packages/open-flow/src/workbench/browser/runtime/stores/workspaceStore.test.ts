import { describe, expect, it, vi } from 'vitest'
import { WorkbenchClient } from '../api.ts'
import { WorkspaceStore } from './workspaceStore.ts'

const timestamp = '2026-08-26T00:00:00.000Z'
const flow = {
  createdAt: timestamp,
  draftRevisionId: 'revision-1',
  flowId: 'flow-1',
  name: 'Main',
  status: 'active',
  updatedAt: timestamp,
  version: 1,
} as const
const draft = {
  actorId: 'actor-1',
  content: {
    document: {
      bindings: {},
      graph: { nodes: {} },
      subflows: {},
      tasks: {},
    },
    modelVersion: 1,
    modules: {},
  },
  createdAt: timestamp,
  digest: 'digest-1',
  flowId: flow.flowId,
  modelVersion: 1,
  parentRevisionId: null,
  revisionId: flow.draftRevisionId,
  version: 1,
} as const

describe('WorkspaceStore', () => {
  it('finishes loading the selected Flow while the catalog reloads', async () => {
    const draftResponse = Promise.withResolvers<Response>()
    const draftRequested = Promise.withResolvers<void>()
    const catalogReloaded = Promise.withResolvers<void>()
    let catalogListener: (() => void) | undefined
    let flowLists = 0
    const request = vi.fn(async (path: string) => {
      if (path == '/v1/flows?limit=50&includeTotal=true') {
        flowLists += 1
        if (flowLists == 2) catalogReloaded.resolve()
        return Response.json({ flows: [flow], total: 1, version: 1 })
      }
      if (path == `/v1/flows/${flow.flowId}/draft`) {
        draftRequested.resolve()
        return await draftResponse.promise
      }
      if (path == `/v1/flows/${flow.flowId}/live`) {
        return Response.json({ flowId: flow.flowId, hasUnpublishedChanges: true, publication: null, revision: 0, status: 'not-published', version: 1 })
      }
      if (path == `/v1/flows/${flow.flowId}/presentation`) {
        return Response.json({ revision: 1, updatedAt: timestamp, value: {}, version: 1 })
      }
      if (path == `/v1/flows/${flow.flowId}/revisions/${flow.draftRevisionId}/check`) {
        return Response.json({
          closureDigest: 'closure-1',
          diagnostics: [],
          engineContract: 'open-flow-engine/v1',
          flowId: flow.flowId,
          modelVersion: 1,
          revisionDigest: draft.digest,
          revisionId: draft.revisionId,
          valid: true,
          version: 1,
        })
      }
      throw new Error(`Unexpected request: ${path}`)
    })
    const client = new WorkbenchClient(
      request,
      () => () => {},
      (listener) => {
        catalogListener = listener
        return () => {}
      },
    )
    const store = new WorkspaceStore(client, vi.fn())

    try {
      const started = store.start(flow.flowId)
      await draftRequested.promise
      catalogListener?.()
      await catalogReloaded.promise
      draftResponse.resolve(Response.json(draft))
      await started

      expect(flowLists).toBe(2)
      expect(store.$.draft.value).toEqual(draft)
      expect(store.$.workspaceLoading.value).toBe(false)
      expect(store.$.status.value).toBe('saved')
    } finally {
      store.dispose()
    }
  })
})
