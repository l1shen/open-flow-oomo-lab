import type { Revision } from '../../src/base/common/revision.ts'
import type {
  ProjectSourceChange,
  ProjectSourceSaveRequest,
  ProjectSourceSaveResult,
  ProjectSourceService,
  ProjectSourceSnapshot,
} from '../../src/project/common/source-service.ts'

import { describe, expect, it } from 'vitest'
import { ManifestSession } from '../../src/manifest/common/session.ts'
import { createYamlSourceValidator } from '../../src/manifest/common/sourceValidator.ts'
import { WritableFlowManifest } from '../../src/manifest/common/writable/writableFlowManifest.ts'
import { FlowSchema } from '../../src/schema/index.ts'

const initialSource = 'title: Before\nnodes: []\n'
const initialRevision = 'revision-1' as Revision
const nextRevision = 'revision-2' as Revision
const validateFlow = createYamlSourceValidator(FlowSchema)

class MemorySourceService implements ProjectSourceService {
  public readonly rootPath = '/project'

  public constructor(private readonly snapshot: ProjectSourceSnapshot) {}

  public async read(filePath: string): Promise<ProjectSourceSnapshot | undefined> {
    return filePath == this.snapshot.path ? this.snapshot : undefined
  }

  public async save(_request: ProjectSourceSaveRequest): Promise<ProjectSourceSaveResult> {
    throw new Error('This test source service does not save.')
  }

  public watch(_filePath: string, _listener: (change: ProjectSourceChange) => void): () => void {
    return () => undefined
  }
}

async function createSession(): Promise<{ manifest: WritableFlowManifest; session: ManifestSession<WritableFlowManifest> }> {
  const path = '/project/flow.oo.yaml'
  const sourceService = new MemorySourceService({ path, source: initialSource, revision: initialRevision })
  const session = await ManifestSession.open({
    path,
    sourceService,
    validateSource: validateFlow,
    createManifest: (initial) => new WritableFlowManifest(initial.source, initial.revision),
    watch: false,
  })
  return { manifest: session.manifest, session }
}

describe('writable manifest source session', () => {
  it('preserves its input source for a no-op save when constructed with a revision', async () => {
    const { manifest, session } = await createSession()

    expect(manifest._toSaveFileString()).toBe(initialSource)
    expect(session.serialize()).toEqual({ source: initialSource, expectedRevision: initialRevision })
  })

  it('rejects a writable manifest that was not constructed with the current revision', async () => {
    const path = '/project/flow.oo.yaml'
    const sourceService = new MemorySourceService({ path, source: initialSource, revision: initialRevision })

    await expect(
      ManifestSession.open({
        path,
        sourceService,
        validateSource: validateFlow,
        createManifest: (initial) => new WritableFlowManifest(initial.source),
        watch: false,
      }),
    ).rejects.toThrow('must be constructed with the current source revision')
  })

  it.each(['[', 'a: *missing\n'])('quarantines invalid external YAML without replacing the live manifest: %s', async (source) => {
    const { manifest, session } = await createSession()
    const yamlParent = manifest.yamlParent

    const result = await session.applyExternal({ source, revision: nextRevision })

    expect(result.status).toBe('invalid')
    expect(manifest.yamlParent).toBe(yamlParent)
    expect(manifest.$.title.value).toBe('Before')
    expect(manifest.revision).toBe(initialRevision)
    expect(session.baselineSnapshot).toEqual({ source: initialSource, revision: initialRevision })
  })

  it('reports a conflict instead of silently dropping an external update while dirty', async () => {
    const { manifest, session } = await createSession()
    manifest.$$.title.set('Local')

    const external = { source: 'title: External\nnodes: []\n', revision: nextRevision }
    const result = await session.applyExternal(external)

    expect(session.dirty).toBe(true)
    expect(result).toEqual({ status: 'conflict', external })
    expect(manifest.$.title.value).toBe('Local')
    expect(session.serialize()).toEqual({ source: 'title: Local\nnodes:\n  []\n', expectedRevision: initialRevision })
  })

  it('applies a clean external update and preserves identity for revision-only changes', async () => {
    const { manifest, session } = await createSession()
    const originalYamlParent = manifest.yamlParent
    let sourceUpdates = 0
    manifest.events.on('sourceUpdated', () => {
      sourceUpdates += 1
    })

    const externalSource = 'title: External\nnodes: []\n'
    await expect(session.applyExternal({ source: externalSource, revision: nextRevision })).resolves.toEqual({ status: 'applied' })
    expect(manifest.yamlParent).not.toBe(originalYamlParent)
    expect(manifest.revision).toBe(nextRevision)
    expect(sourceUpdates).toBeGreaterThanOrEqual(1)

    const updatedYamlParent = manifest.yamlParent
    const appliedSourceUpdates = sourceUpdates
    await expect(session.applyExternal({ source: externalSource, revision: nextRevision })).resolves.toEqual({ status: 'unchanged' })
    expect(manifest.yamlParent).toBe(updatedYamlParent)
    expect(sourceUpdates).toBe(appliedSourceUpdates)

    const revisionOnly = 'revision-3' as Revision
    await expect(session.applyExternal({ source: externalSource, revision: revisionOnly })).resolves.toEqual({ status: 'applied' })
    expect(manifest.yamlParent).toBe(updatedYamlParent)
    expect(manifest.revision).toBe(revisionOnly)
    expect(sourceUpdates).toBe(appliedSourceUpdates)
  })
})
