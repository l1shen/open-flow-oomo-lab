import type { IDisposable } from '@wopjs/disposable'
import type { DirtyResourceTracker } from '../dirtyResourceTracker.ts'
import type { DesignerUIStore } from '../stores/designer/designerUI.store.ts'

export interface UIFileAutoSave extends IDisposable {
  flush(): Promise<void>
}

class UIFileAutoSaveController implements UIFileAutoSave {
  readonly #designerUIStore: DesignerUIStore
  readonly #disposeListeners: () => void
  readonly #dirtyResources: DirtyResourceTracker
  readonly #manifestPath: string
  readonly #saveUIFile: (uiPath: string, data: unknown) => Promise<void>
  readonly #uiPath: string
  #disposed = false
  #generation = 0
  #operation: Promise<void> | undefined
  #savedGeneration = 0
  #timer: ReturnType<typeof setTimeout> | undefined

  public constructor(
    dirtyResources: DirtyResourceTracker,
    manifestPath: string,
    uiPath: string,
    designerUIStore: DesignerUIStore,
    saveUIFile: (uiPath: string, data: unknown) => Promise<void>,
  ) {
    this.#dirtyResources = dirtyResources
    this.#manifestPath = manifestPath
    this.#uiPath = uiPath
    this.#designerUIStore = designerUIStore
    this.#saveUIFile = saveUIFile
    this.#disposeListeners = designerUIStore.onChanged(() => {
      this.#generation++
      this.#dirtyResources.mark(this.#manifestPath, true)
      this.#schedule()
    })
  }

  public async flush(): Promise<void> {
    if (this.#disposed) return
    if (this.#timer != null) {
      clearTimeout(this.#timer)
      this.#timer = undefined
    }
    this.#operation ??= this.#saveUntilStable().finally(() => {
      this.#operation = undefined
    })
    await this.#operation
  }

  public dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    if (this.#timer != null) clearTimeout(this.#timer)
    this.#timer = undefined
    this.#disposeListeners()
  }

  #schedule(): void {
    if (this.#disposed) return
    if (this.#timer != null) clearTimeout(this.#timer)
    this.#timer = setTimeout(() => {
      this.#timer = undefined
      void this.flush().catch(console.error)
    }, 400)
  }

  async #saveUntilStable(): Promise<void> {
    if (!this.#disposed && this.#savedGeneration < this.#generation) {
      const generation = this.#generation
      const data = this.#designerUIStore.toUIData()
      await this.#saveUIFile(this.#uiPath, data)
      this.#savedGeneration = generation
      return this.#saveUntilStable()
    }
    if (!this.#disposed && this.#savedGeneration == this.#generation) {
      this.#dirtyResources.mark(this.#manifestPath, false)
    }
  }
}

export function setupAutoSaveUIFile(
  dirtyResources: DirtyResourceTracker,
  manifestPath: string,
  uiPath: string,
  designerUIStore: DesignerUIStore,
  saveUIFile: (uiPath: string, data: unknown) => Promise<void>,
): UIFileAutoSave {
  return new UIFileAutoSaveController(dirtyResources, manifestPath, uiPath, designerUIStore, saveUIFile)
}
