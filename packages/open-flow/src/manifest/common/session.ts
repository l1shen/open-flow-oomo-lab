import type { Revision } from '../../base/common/revision.ts'
import type {
  ProjectSourceChange,
  ProjectSourceSaveResult,
  ProjectSourceService,
  ProjectSourceSnapshot,
  SaveCandidate,
  SourceSnapshot,
} from '../../project/common/source-service.ts'
import type { ManifestSource } from './source.ts'
import type { SourceDiagnostic, SourceValidator } from './sourceValidator.ts'

import { absentSourceRevision } from '../../project/common/source-service.ts'

function toManifestSource(snapshot: SourceSnapshot): ManifestSource {
  return { source: snapshot.source, revision: snapshot.revision }
}

export interface WritableSourceManifest {
  readonly dispose?: () => void
  readonly events: {
    on(event: 'changed', listener: () => void): () => void
  }
  revision?: Revision
  _toSaveFileString(): string
  updateSource(source: ManifestSource): void
}

export interface AppliedExternalSource {
  readonly status: 'applied'
}

export interface UnchangedExternalSource {
  readonly status: 'unchanged'
}

export interface InvalidExternalSource {
  readonly status: 'invalid'
  readonly diagnostics: readonly SourceDiagnostic[]
  readonly external: SourceSnapshot
}

export interface ConflictingExternalSource {
  readonly status: 'conflict'
  readonly external: SourceSnapshot
}

export interface DeletedManifestSource {
  readonly path: string
  readonly status: 'deleted'
}

export type ExternalSourceResult = AppliedExternalSource | UnchangedExternalSource | InvalidExternalSource | ConflictingExternalSource
export type ManifestExternalState = InvalidExternalSource | ConflictingExternalSource | DeletedManifestSource | undefined
export type ManifestRefreshResult = ExternalSourceResult | DeletedManifestSource

export interface ManifestSessionOptions<TManifest extends WritableSourceManifest> {
  readonly path: string
  readonly sourceService: ProjectSourceService
  readonly validateSource: SourceValidator
  readonly createManifest: (initial: ProjectSourceSnapshot) => TManifest
  readonly createAbsentManifest?: () => TManifest
  readonly onError?: (error: Error) => void
  readonly onRefresh?: (result: ManifestRefreshResult) => void
  readonly watch?: boolean
}

export class InvalidInitialManifestSourceError extends Error {
  public readonly diagnostics: readonly SourceDiagnostic[]
  public readonly external: ProjectSourceSnapshot

  public constructor(external: ProjectSourceSnapshot, diagnostics: readonly SourceDiagnostic[]) {
    super(`Manifest ${external.path} contains invalid source.`)
    this.name = 'InvalidInitialManifestSourceError'
    this.external = external
    this.diagnostics = diagnostics
  }
}

export class ManifestSession<TManifest extends WritableSourceManifest> {
  public readonly manifest: TManifest
  public readonly path: string

  readonly #onError: ((error: Error) => void) | undefined
  readonly #onRefresh: ((result: ManifestRefreshResult) => void) | undefined
  readonly #sourceService: ProjectSourceService
  readonly #stopManifestListener: () => void
  readonly #stopWatching: (() => void) | undefined
  readonly #validateSource: SourceValidator
  #dirty = false
  #disposed = false
  #externalState: ManifestExternalState
  #lastSubmittedSource: string | undefined
  #operation: Promise<void> = Promise.resolve()
  #revision: Revision | typeof absentSourceRevision
  #source: string

  private constructor(initial: ProjectSourceSnapshot | undefined, manifest: TManifest, options: ManifestSessionOptions<TManifest>) {
    if (initial == null) {
      if (manifest.revision != null) throw new Error('An absent writable manifest must not have a source revision.')
    } else if (manifest.revision != initial.revision) {
      throw new Error('The writable manifest must be constructed with the current source revision.')
    }
    this.path = options.path
    this.manifest = manifest
    this.#source = initial?.source ?? ''
    this.#revision = initial?.revision ?? absentSourceRevision
    this.#sourceService = options.sourceService
    this.#validateSource = options.validateSource
    this.#onError = options.onError
    this.#onRefresh = options.onRefresh
    this.#stopManifestListener = manifest.events.on('changed', () => {
      this.#dirty = true
    })
    if (options.watch == false) {
      this.#stopWatching = undefined
    } else {
      this.#stopWatching = options.sourceService.watch(this.path, (change) => {
        void this.#run(() => this.#applyChange(change)).catch((error) => this.#reportError(error))
      })
    }
  }

  public static async open<TManifest extends WritableSourceManifest>(options: ManifestSessionOptions<TManifest>): Promise<ManifestSession<TManifest>> {
    const initial = await options.sourceService.read(options.path)
    return ManifestSession.create(initial, options)
  }

  public static async openExisting<TManifest extends WritableSourceManifest>(
    options: ManifestSessionOptions<TManifest>,
  ): Promise<ManifestSession<TManifest> | undefined> {
    const initial = await options.sourceService.read(options.path)
    if (initial == null) return undefined
    return ManifestSession.create(initial, options)
  }

  private static create<TManifest extends WritableSourceManifest>(
    initial: ProjectSourceSnapshot | undefined,
    options: ManifestSessionOptions<TManifest>,
  ): ManifestSession<TManifest> {
    if (!initial && options.createAbsentManifest == null) throw new Error(`Manifest ${options.path} does not exist.`)
    const source = initial?.source ?? ''
    const diagnostics = options.validateSource(source)
    if (diagnostics.length > 0) {
      if (initial == null) throw new Error(`The default source for absent manifest ${options.path} is invalid.`)
      throw new InvalidInitialManifestSourceError(initial, diagnostics)
    }
    let manifest: TManifest
    if (initial == null) {
      const createAbsentManifest = options.createAbsentManifest
      if (createAbsentManifest == null) throw new Error(`Manifest ${options.path} does not exist.`)
      manifest = createAbsentManifest()
    } else {
      manifest = options.createManifest(initial)
    }
    return new ManifestSession(initial, manifest, options)
  }

  public get dirty(): boolean {
    return this.#dirty
  }

  public get externalState(): ManifestExternalState {
    return this.#externalState
  }

  public get readOnly(): boolean {
    return this.#externalState?.status == 'invalid' || this.#externalState?.status == 'conflict' || this.#externalState?.status == 'deleted'
  }

  public get baselineSnapshot(): SourceSnapshot | undefined {
    if (this.#revision != absentSourceRevision) return { source: this.#source, revision: this.#revision }
  }

  public get lastSubmittedSource(): string | undefined {
    return this.#lastSubmittedSource
  }

  public async applyExternal(external: SourceSnapshot, overwriteLocal = false): Promise<ExternalSourceResult> {
    await Promise.resolve()
    if (external.revision == this.#revision && (!overwriteLocal || !this.#dirty)) return { status: 'unchanged' }

    const diagnostics = this.#validateSource(external.source)
    if (diagnostics.length > 0) return { status: 'invalid', diagnostics, external }
    if (this.#dirty && !overwriteLocal) {
      if (this.manifest._toSaveFileString() == external.source) {
        this.#acceptSaved(external, external.source)
        return { status: 'applied' }
      }
      return { status: 'conflict', external }
    }
    if (overwriteLocal) {
      this.manifest._toSaveFileString()
      this.#dirty = false
    }

    this.manifest.updateSource(toManifestSource(external))
    await Promise.resolve()
    if (this.manifest.revision != external.revision) {
      // Source-derived reactions can mark the original manifest dirty after an external update.
      this.manifest._toSaveFileString()
      this.manifest.updateSource(toManifestSource(external))
      await Promise.resolve()
    }
    this.#dirty = false
    this.#source = external.source
    this.#revision = external.revision
    return { status: 'applied' }
  }

  public async refresh(): Promise<ManifestRefreshResult> {
    return this.#run(async () => {
      const snapshot = await this.#sourceService.read(this.path)
      if (snapshot == null && this.#revision == absentSourceRevision) return this.#publish({ status: 'unchanged' })
      return this.#applyChange(snapshot ?? { path: this.path, status: 'deleted' })
    })
  }

  public async reload(): Promise<ManifestRefreshResult> {
    return this.#run(async () => {
      const snapshot = await this.#sourceService.read(this.path)
      if (snapshot == null && this.#revision == absentSourceRevision) return this.#publish({ status: 'unchanged' })
      if (!snapshot) {
        const deleted: DeletedManifestSource = { path: this.path, status: 'deleted' }
        this.#externalState = deleted
        return this.#publish(deleted)
      }
      const result = await this.applyExternal(snapshot, true)
      this.#externalState = result.status == 'invalid' ? result : undefined
      return this.#publish(result)
    })
  }

  public async save(overwrite = false): Promise<ProjectSourceSaveResult> {
    return this.#run(async () => {
      await Promise.resolve()
      const candidate = this.serialize()
      this.#lastSubmittedSource = candidate.source
      const result = await this.#sourceService.save({ path: this.path, ...candidate, overwrite })
      if (result.status != 'conflict') {
        this.#acceptSaved(result.snapshot, candidate.source)
        this.#externalState = undefined
      } else if (result.conflict.kind == 'deleted') {
        this.#externalState = { path: this.path, status: 'deleted' }
      } else if (result.conflict.disk) {
        const diagnostics = this.#validateSource(result.conflict.disk.source)
        if (diagnostics.length > 0) {
          this.#externalState = { status: 'invalid', diagnostics, external: result.conflict.disk }
        } else {
          this.#externalState = { status: 'conflict', external: result.conflict.disk }
        }
      }
      return result
    })
  }

  public async reconcileSavedSnapshot(snapshot: SourceSnapshot, submittedSource: string): Promise<void> {
    await this.#run(async () => {
      if (snapshot.source != submittedSource) throw new Error('The reconciled source does not match the submitted manifest source.')
      this.#acceptSaved(snapshot, submittedSource)
      this.#externalState = undefined
    })
  }

  public serialize(): SaveCandidate {
    return {
      source: this.manifest._toSaveFileString(),
      expectedRevision: this.#revision,
    }
  }

  public dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#stopManifestListener()
    this.#stopWatching?.()
  }

  #acceptSaved(saved: SourceSnapshot, submittedSource: string): void {
    if (submittedSource != saved.source) throw new Error('The saved source does not match the submitted manifest source.')
    const currentSource = this.manifest._toSaveFileString()
    if (currentSource == saved.source) {
      this.manifest.updateSource(toManifestSource(saved))
      this.#dirty = false
    } else {
      this.#dirty = true
    }
    this.#source = saved.source
    this.#revision = saved.revision
  }

  async #applyChange(change: ProjectSourceChange): Promise<ManifestRefreshResult> {
    if (!('source' in change)) {
      if (this.#revision == absentSourceRevision) return this.#publish({ status: 'unchanged' })
      this.#externalState = change
      return this.#publish(change)
    }
    const result = await this.applyExternal(change)
    this.#externalState = result.status == 'invalid' || result.status == 'conflict' ? result : undefined
    return this.#publish(result)
  }

  #publish<T extends ManifestRefreshResult>(result: T): T {
    this.#onRefresh?.(result)
    return result
  }

  async #run<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.#operation
    const next = Promise.withResolvers<void>()
    this.#operation = next.promise
    await previous
    try {
      if (this.#disposed) throw new Error(`Manifest session ${this.path} is closed.`)
      return await operation()
    } finally {
      next.resolve()
    }
  }

  #reportError(error: unknown): void {
    this.#onError?.(error instanceof Error ? error : new Error(String(error)))
  }
}
