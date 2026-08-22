import type { ReadonlyVal, Val } from 'value-enhancer'

import { val } from 'value-enhancer'

export interface DirtyResourceTracker {
  readonly resources$: ReadonlyVal<ReadonlySet<string>>
  mark(path: string, dirty: boolean): void
  rename(originPath: string, newPath: string): void
}

export class BrowserDirtyResourceTracker implements DirtyResourceTracker {
  private readonly resources: Val<ReadonlySet<string>>

  public readonly resources$: ReadonlyVal<ReadonlySet<string>>

  public constructor(initialResources?: Iterable<string>) {
    this.resources = val<ReadonlySet<string>>(new Set(initialResources))
    this.resources$ = this.resources
  }

  public mark(path: string, dirty: boolean): void {
    const resources = this.resources.value
    if (dirty !== resources.has(path)) {
      const next = new Set(resources)
      if (dirty) {
        next.add(path)
      } else {
        next.delete(path)
      }
      this.resources.set(next)
    }
  }

  public rename(originPath: string, newPath: string): void {
    if (this.resources.value.has(originPath)) {
      const next = new Set(this.resources.value)
      next.delete(originPath)
      next.add(newPath)
      this.resources.set(next)
    }
  }

  public dispose(): void {
    this.resources.dispose()
  }
}
