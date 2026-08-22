import type { DisposableStore } from '@wopjs/disposable'
import type { ReactiveMap, ReadonlyReactiveMap } from 'value-enhancer/collections'
import type { ResourceUriResolver } from '../../../../base/common/resource.ts'
import type { FlowName, FlowPath } from '../../manifestTypes.ts'
import type { ManifestSource, PackageManifestKind } from '../../source.ts'
import type { WritableFlowManifest } from '../../writable/writableFlowManifest.ts'
import type { ResolveSharedBlockMeta$ } from '../nodeMeta.ts'
import type { PackageMeta } from './packageMeta.ts'

import { disposableStore, dispose } from '@wopjs/disposable'
import { reactiveMap } from 'value-enhancer/collections'
import { basename, isParent, join } from '../../../../base/common/posixPath.ts'
import { FlowMeta } from '../flowMeta.ts'

interface FlowRefreshCandidate {
  readonly flowMeta: FlowMeta | undefined
  readonly flowPath: FlowPath
  readonly manifest: WritableFlowManifest
}

export interface FlowsManagerContext {
  readonly resolveResourceUri: ResourceUriResolver
  listManifestPaths(kind: PackageManifestKind): Promise<readonly string[]>
  openFlowManifest(path: FlowPath): Promise<WritableFlowManifest | undefined>
  removeFileDir(fileOrDirPath: string): Promise<void>
  copyFileDir(srcPath: string, destPath: string): Promise<string>
  renameFileDir(srcPath: string, destPath: string): Promise<string>
  ensureFile(filePath: string, defaultSource: string): Promise<ManifestSource>
}

export class FlowsManager {
  public readonly dispose: DisposableStore = disposableStore()

  public readonly flowsByName: ReadonlyReactiveMap<FlowName, FlowMeta>
  readonly #flowsByName: ReactiveMap<FlowName, FlowMeta>

  public readonly flowsByPath: ReadonlyReactiveMap<FlowPath, FlowMeta>
  readonly #flowsByPath: ReactiveMap<FlowPath, FlowMeta>

  public constructor(
    private readonly packageMeta: PackageMeta,
    private readonly ctx: FlowsManagerContext,
    private readonly resolveSharedBlockMeta$: ResolveSharedBlockMeta$,
  ) {
    this.flowsByName = this.#flowsByName = this.dispose.add(reactiveMap(null, { onDeleted: dispose }))
    this.flowsByPath = this.#flowsByPath = this.dispose.add(reactiveMap())
  }

  public getFlowPath(flowName: FlowName): FlowPath {
    return join(this.packageMeta.packageDir, 'flows', flowName, 'flow.oo.yaml') as FlowPath
  }

  /** Removes a Flow after an explicit authoring action. */
  public async userRemoveFlow(flowMeta: FlowMeta): Promise<void> {
    if (!this.#isInScope(flowMeta.flowPath)) return

    this.removeFlowMeta(flowMeta)
  }

  /** Removes a Flow as part of an internal rename or conversion. */
  public async removeFlowMeta(flowMeta: FlowMeta): Promise<void> {
    if (!this.#isInScope(flowMeta.flowPath)) return

    await this.ctx.removeFileDir(flowMeta.manifestDir)

    this.onFlowFilesDidRemove(flowMeta)
  }

  public onFlowFilesDidRemove(flowMeta: FlowMeta): void {
    this.#flowsByName.delete(flowMeta.flowName)
    this.#flowsByPath.delete(flowMeta.flowPath)
  }

  public async renameFlow(flowMeta: FlowMeta, newName: FlowName): Promise<FlowMeta | undefined> {
    if (!this.#isInScope(flowMeta.flowPath)) return

    if (this.flowsByName.has(newName)) {
      return
    }

    const newFlowDir = await this.ctx.renameFileDir(flowMeta.manifestDir, join(flowMeta.manifestDir, '..', newName))

    const newFlowPath = join(newFlowDir, basename(flowMeta.flowPath)) as FlowPath

    const newFlowMeta = await this.refreshFlow(newFlowPath)

    this.onFlowFilesDidRemove(flowMeta)

    return newFlowMeta
  }

  public async duplicateFlow(flowMeta: FlowMeta, newName: FlowName): Promise<FlowMeta | undefined> {
    if (!this.#isInScope(flowMeta.flowPath)) return

    try {
      const newDir = await this.ctx.copyFileDir(flowMeta.manifestDir, join(flowMeta.manifestDir, '..', newName))
      const newFlowPath = join(newDir, basename(flowMeta.flowPath)) as FlowPath
      return await this.refreshFlow(newFlowPath)
    } catch (e) {
      console.error(e)
    }
  }

  public async refreshFlow(flowPath: FlowPath, ensure: true): Promise<FlowMeta>
  public async refreshFlow(flowPath: FlowPath, ensure?: boolean): Promise<FlowMeta | undefined>
  public async refreshFlow(flowPath: FlowPath, ensure?: boolean): Promise<FlowMeta | undefined> {
    let manifest = await this.ctx.openFlowManifest(flowPath)
    if (!manifest && ensure) {
      await this.ctx.ensureFile(flowPath, '')
      manifest = await this.ctx.openFlowManifest(flowPath)
      if (!manifest) throw new Error(`Flow manifest failed to open after creation: ${flowPath}`)
    }
    if (manifest) return this.#upsertFlowMeta(flowPath, manifest)
  }

  #refreshId = 0
  public async refreshAll(): Promise<void> {
    const refreshID = (this.#refreshId = (this.#refreshId + 1) | 0)

    const candidates = await this.#listFlows()
    if (refreshID !== this.#refreshId) return

    const flows = candidates.map((candidate) => {
      if (candidate.flowMeta?.manifest == candidate.manifest) {
        return candidate.flowMeta
      } else {
        return this.#createFlowMeta(candidate.flowPath, candidate.manifest)
      }
    })

    this.#flowsByName.replace(flows.map((flowMeta) => [flowMeta.flowName, flowMeta] as const))
    this.#flowsByPath.replace(flows.map((flowMeta) => [flowMeta.flowPath, flowMeta] as const))
  }

  async #listFlows(): Promise<FlowRefreshCandidate[]> {
    const paths = await this.ctx.listManifestPaths('flow')
    return Promise.all(
      paths.map(async (path): Promise<FlowRefreshCandidate> => {
        const flowPath = path as FlowPath
        const flowMeta = FlowMeta.to(this.flowsByPath.get(flowPath))
        const manifest = await this.ctx.openFlowManifest(flowPath)
        if (!manifest) throw new Error(`Listed Flow manifest does not exist: ${flowPath}`)
        return { flowMeta, flowPath, manifest }
      }),
    )
  }

  #insertFlowMeta(flowPath: FlowPath, manifest: WritableFlowManifest): FlowMeta {
    const flowMeta = this.#createFlowMeta(flowPath, manifest)
    this.#flowsByName.set(flowMeta.flowName, flowMeta)
    this.#flowsByPath.set(flowMeta.flowPath, flowMeta)
    return flowMeta
  }

  #upsertFlowMeta(flowPath: FlowPath, manifest: WritableFlowManifest): FlowMeta {
    const flowMeta = this.flowsByPath.get(flowPath)
    if (flowMeta?.manifest == manifest) {
      return flowMeta
    } else {
      return this.#insertFlowMeta(flowPath, manifest)
    }
  }

  #createFlowMeta(flowPath: FlowPath, manifest: WritableFlowManifest): FlowMeta {
    const flowMeta = new FlowMeta(flowPath, this.packageMeta.searchPath, this.packageMeta, manifest, this.resolveSharedBlockMeta$, this.ctx.resolveResourceUri)
    return flowMeta
  }

  #isInScope(flowPath: FlowPath): boolean {
    if (!isParent(flowPath, this.packageMeta.packageDir)) {
      console.error(new Error(`flow path ${flowPath} out of scope: ${this.packageMeta.packageDir}`))
      return false
    }

    return true
  }
}
