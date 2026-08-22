import type { ReadonlyVal, Val } from 'value-enhancer'

import { val } from 'value-enhancer'

export type ResourcePath = string

export interface ResourceNavigation {
  readonly focusedResource$: ReadonlyVal<ResourcePath | undefined>
  open(path: ResourcePath): Promise<void>
  replace(originPath: ResourcePath, newPath: ResourcePath): Promise<void>
}

export interface BrowserResourceNavigationOptions {
  readonly focusedResource?: ResourcePath
  readonly onOpen?: (path: ResourcePath) => boolean | void | Promise<boolean | void>
  readonly onReplace?: (originPath: ResourcePath, newPath: ResourcePath) => void | Promise<void>
}

export class BrowserResourceNavigation implements ResourceNavigation {
  private readonly focusedResource: Val<ResourcePath | undefined>

  public readonly focusedResource$: ReadonlyVal<ResourcePath | undefined>

  public constructor(private readonly options: BrowserResourceNavigationOptions = {}) {
    this.focusedResource = val(options.focusedResource)
    this.focusedResource$ = this.focusedResource
  }

  public async open(path: ResourcePath): Promise<void> {
    const opened = await this.options.onOpen?.(path)
    if (opened !== false) this.focusedResource.set(path)
  }

  public async replace(originPath: ResourcePath, newPath: ResourcePath): Promise<void> {
    await this.options.onReplace?.(originPath, newPath)
    if (this.focusedResource.value == originPath) this.focusedResource.set(newPath)
  }

  public setFocused(path: ResourcePath | undefined): void {
    this.focusedResource.set(path)
  }

  public dispose(): void {
    this.focusedResource.dispose()
  }
}
