import type { ResourceUriResolver } from '../../src/base/common/resource.ts'
import type { Revision } from '../../src/base/common/revision.ts'
import type { UIFileSaveCandidate, UIFileSaveResult } from '../../src/designer/common/designerHost.ts'
import type { DesignerFileHost, DesignerFileKind } from '../../src/designer/common/fileBackedDesignerHost.ts'
import type { BlockPath, FlowPath } from '../../src/manifest/common/manifestTypes.ts'
import type { PackageMetaContext } from '../../src/manifest/common/meta/package/packageMeta.ts'
import type { ManifestReadResult, ManifestSource, PackageManifestKind } from '../../src/manifest/common/source.ts'

import { val } from 'value-enhancer'
import { extname, join } from '../../src/base/common/posixPath.ts'
import { WritableSubflowBlockManifest } from '../../src/manifest/common/writable/block/writableSubflowBlockManifest.ts'
import { WritableTaskBlockManifest } from '../../src/manifest/common/writable/block/writableTaskBlockManifest.ts'
import { WritableFlowManifest } from '../../src/manifest/common/writable/writableFlowManifest.ts'

export interface MemorySourceFile {
  readonly path: string
  readonly source: string
  readonly revision?: Revision
}

export class MemoryDesignerHost implements PackageMetaContext, DesignerFileHost {
  public readonly lang$ = val('en')
  public readonly resolveResourceUri: ResourceUriResolver = (resourcePath) => resourcePath

  private readonly files = new Map<string, ManifestSource>()
  private readonly flowManifests = new Map<string, WritableFlowManifest>()
  private readonly subflowManifests = new Map<string, WritableSubflowBlockManifest>()
  private readonly taskManifests = new Map<string, WritableTaskBlockManifest>()
  private revisionIndex = 0

  public constructor(files: readonly MemorySourceFile[]) {
    for (const file of files) {
      this.files.set(file.path, {
        source: file.source,
        revision: file.revision ?? this.nextRevision(),
      })
    }
  }

  public async listManifestPaths(kind: PackageManifestKind): Promise<readonly string[]> {
    const segment = `/${kind}s/`
    return Array.from(this.files.keys())
      .filter((path) => path.includes(segment) && path.endsWith(`/${kind}.oo.yaml`))
      .toSorted()
  }

  public async openFlowManifest(path: FlowPath): Promise<WritableFlowManifest | undefined> {
    let manifest = this.flowManifests.get(path)
    const snapshot = this.files.get(path)
    if (!manifest && snapshot) {
      manifest = new WritableFlowManifest(snapshot.source, snapshot.revision)
      this.flowManifests.set(path, manifest)
    }
    return manifest
  }

  public async openTaskManifest(path: BlockPath): Promise<WritableTaskBlockManifest | undefined> {
    let manifest = this.taskManifests.get(path)
    const snapshot = this.files.get(path)
    if (!manifest && snapshot) {
      manifest = new WritableTaskBlockManifest(snapshot.source, snapshot.revision)
      this.taskManifests.set(path, manifest)
    }
    return manifest
  }

  public async openSubflowManifest(path: BlockPath): Promise<WritableSubflowBlockManifest | undefined> {
    let manifest = this.subflowManifests.get(path)
    const snapshot = this.files.get(path)
    if (!manifest && snapshot) {
      manifest = new WritableSubflowBlockManifest(snapshot.source, snapshot.revision)
      this.subflowManifests.set(path, manifest)
    }
    return manifest
  }

  public async readFile(path: string): Promise<ManifestSource | undefined>
  public async readFile(path: string, refRevision: Revision | undefined): Promise<ManifestReadResult>
  public async readFile(path: string, refRevision?: Revision): Promise<ManifestReadResult> {
    const snapshot = this.files.get(path)
    return snapshot != null && snapshot.revision == refRevision ? 'unchanged' : snapshot
  }

  public async readScriptletSource(path: string): Promise<string | undefined> {
    return this.files.get(path)?.source
  }

  public async fileDirExists(path: string): Promise<boolean> {
    return (await this.getKind(path)) != null
  }

  public async removeFileDir(path: string): Promise<void> {
    const prefix = `${path}/`
    for (const filePath of this.files.keys()) {
      if (filePath == path || filePath.startsWith(prefix)) {
        this.files.delete(filePath)
        this.flowManifests.delete(filePath)
        this.taskManifests.delete(filePath)
        this.subflowManifests.delete(filePath)
      }
    }
  }

  public async copyFileDir(sourcePath: string, targetPath: string): Promise<string> {
    const sourcePrefix = `${sourcePath}/`
    let copied = false
    for (const [filePath, snapshot] of Array.from(this.files)) {
      if (filePath == sourcePath || filePath.startsWith(sourcePrefix)) {
        const targetFilePath = `${targetPath}${filePath.slice(sourcePath.length)}`
        this.files.set(targetFilePath, { source: snapshot.source, revision: this.nextRevision() })
        copied = true
      }
    }
    if (!copied) {
      throw new Error(`Source path does not exist: ${sourcePath}`)
    }
    return targetPath
  }

  public async renameFileDir(sourcePath: string, targetPath: string): Promise<string> {
    await this.copyFileDir(sourcePath, targetPath)
    await this.removeFileDir(sourcePath)
    return targetPath
  }

  public async writeScriptletFile(flowLikeDir: string, extension: string, source: string): Promise<string> {
    let index = 0
    let entry: string
    let path: string
    do {
      entry = join('scriptlets', `+scriptlet#${++index}${extension}`)
      path = join(flowLikeDir, entry)
    } while (this.files.has(path))
    this.files.set(path, { source, revision: this.nextRevision() })
    return entry
  }

  public async duplicateScriptletFile(flowLikeDir: string, sourcePath: string): Promise<string> {
    const source = this.files.get(sourcePath)?.source ?? ''
    return this.writeScriptletFile(flowLikeDir, extname(sourcePath), source)
  }

  public async createFile(path: string, source: string): Promise<ManifestSource> {
    if (this.files.has(path)) throw new Error(`File already exists: ${path}`)
    const snapshot = { source, revision: this.nextRevision() }
    this.files.set(path, snapshot)
    return snapshot
  }

  public async ensureFile(path: string, defaultSource: string): Promise<ManifestSource> {
    const current = this.files.get(path)
    if (current) return current
    const revision = this.nextRevision()
    const snapshot = { source: defaultSource, revision }
    this.files.set(path, snapshot)
    return snapshot
  }

  public async getKind(path: string): Promise<DesignerFileKind | undefined> {
    if (this.files.has(path)) return 'file'
    const prefix = `${path}/`
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix)) return 'directory'
    }
    return undefined
  }

  public async readUIFile(path: string): Promise<{ source: string | null; revision: string | undefined }> {
    const snapshot = this.files.get(path)
    return { source: snapshot?.source ?? null, revision: snapshot?.revision }
  }

  public async writeUIFile(path: string, candidate: UIFileSaveCandidate): Promise<UIFileSaveResult> {
    const current = this.files.get(path)
    if (current?.revision != candidate.expectedRevision) {
      return { status: 'conflict', snapshot: { source: current?.source ?? null, revision: current?.revision } }
    }
    if (candidate.source != null) {
      const revision = this.nextRevision()
      this.files.set(path, { source: candidate.source, revision: revision })
      return { status: 'saved', snapshot: { source: candidate.source, revision } }
    } else {
      this.files.delete(path)
      return { status: 'saved', snapshot: { source: null, revision: undefined } }
    }
  }

  public dispose(): void {
    this.lang$.dispose()
  }

  private nextRevision(): Revision {
    return `memory-${++this.revisionIndex}` as Revision
  }
}
