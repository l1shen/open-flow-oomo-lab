import type { UIFileContentSnapshot, UIFileSaveCandidate, UIFileSaveResult } from '../../src/designer/common/designerHost.ts'
import type { DesignerFileHost } from '../../src/designer/common/fileBackedDesignerHost.ts'
import type { CompareResult, CompareSchemaInfo } from '../../src/manifest/common/schemaCompare.ts'

import { describe, expect, it, vi } from 'vitest'
import { FileBackedDesignerHost } from '../../src/designer/common/fileBackedDesignerHost.ts'

class MemoryDesignerFiles implements DesignerFileHost {
  public readonly files = new Map<string, UIFileContentSnapshot>()
  public readonly directories = new Set<string>()
  private revisionIndex = 0

  public async getKind(path: string): Promise<'file' | 'directory' | undefined> {
    if (this.files.has(path)) return 'file'
    if (this.directories.has(path)) return 'directory'
    return undefined
  }

  public async readUIFile(path: string): Promise<UIFileContentSnapshot> {
    return this.files.get(path) ?? { source: null, revision: undefined }
  }

  public async writeUIFile(path: string, candidate: UIFileSaveCandidate): Promise<UIFileSaveResult> {
    const current = await this.readUIFile(path)
    if (current.revision != candidate.expectedRevision) return { status: 'conflict', snapshot: current }
    if (candidate.source != null) {
      const snapshot = { source: candidate.source, revision: `memory-${++this.revisionIndex}` }
      this.files.set(path, snapshot)
      return { status: 'saved', snapshot }
    } else {
      this.files.delete(path)
      return { status: 'saved', snapshot: { source: null, revision: undefined } }
    }
  }

  public setFile(path: string, source: string): void {
    this.files.set(path, { source, revision: `memory-${++this.revisionIndex}` })
  }
}

function createHost(files = new MemoryDesignerFiles(), compareJSONSchema = vi.fn(async (): Promise<CompareResult> => ({ kind: 'compatible' }))) {
  return { files, compareJSONSchema, host: new FileBackedDesignerHost({ files, compareJSONSchema }) }
}

describe('File-backed Designer host', () => {
  it('locates sidecars for manifest files and block directories', async () => {
    const { files, host } = createHost()
    files.setFile('/workspace/flows/main.oo.yaml', 'title: Main')
    files.setFile('/workspace/flows/.main.ui.oo.json', '{"viewport":{}}')
    files.directories.add('/workspace/tasks/greet')

    await expect(host.locateAndReadUIFile('/workspace/flows/main.oo.yaml')).resolves.toEqual({
      path: '/workspace/flows/.main.ui.oo.json',
      source: '{"viewport":{}}',
      revision: 'memory-2',
    })
    await expect(host.locateAndReadUIFile('/workspace/tasks/greet')).resolves.toEqual({
      path: '/workspace/tasks/greet/.ui.oo.json',
      source: null,
      revision: undefined,
    })
    await expect(host.locateAndReadUIFile('/workspace/missing.oo.yaml')).rejects.toThrow('Invalid manifest path')
  })

  it('rejects a stale sidecar save instead of overwriting the current source', async () => {
    const { files, host } = createHost()
    files.setFile('/workspace/flows/main.oo.yaml', 'title: Main')
    files.setFile('/workspace/flows/.main.ui.oo.json', '{"viewport":{"x":1}}')
    const snapshot = await host.locateAndReadUIFile('/workspace/flows/main.oo.yaml')

    files.setFile(snapshot.path, '{"viewport":{"x":2}}')
    await expect(host.writeUIFile(snapshot.path, { source: '{"viewport":{"x":3}}', expectedRevision: snapshot.revision })).resolves.toEqual({
      status: 'conflict',
      snapshot: { source: '{"viewport":{"x":2}}', revision: 'memory-3' },
    })
    expect(await files.readUIFile(snapshot.path)).toEqual({ source: '{"viewport":{"x":2}}', revision: 'memory-3' })
  })

  it('forwards schema comparisons without changing their context', async () => {
    const { host, compareJSONSchema } = createHost()
    const from: CompareSchemaInfo = { schema: { type: 'string' }, packageId: undefined }
    const to: CompareSchemaInfo = { schema: { type: 'number' }, packageId: undefined }
    compareJSONSchema.mockResolvedValue({ kind: 'incompatible', error: 'edgeError.default' })

    await expect(host.compareJSONSchema(from, to)).resolves.toEqual({ kind: 'incompatible', error: 'edgeError.default' })
    expect(compareJSONSchema).toHaveBeenCalledWith(from, to)
  })
})
