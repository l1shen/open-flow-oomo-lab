import type { ReadonlyVal } from 'value-enhancer'
import type { Flow } from './api.ts'
import type { WorkbenchLocation, WorkbenchNavigationOptions, WorkbenchView } from './contract.ts'
import type { WorkbenchStore } from './stores/workbenchStore.ts'

import { val } from 'value-enhancer'

function availableView(view: WorkbenchView, flow: Flow | undefined): WorkbenchView {
  if (flow == null) return 'design'
  if (view == 'design' && flow?.draft == null && flow != null) return 'publications'
  return view
}

export class NavigationStore {
  readonly #navigate: (location: WorkbenchLocation, options: WorkbenchNavigationOptions) => void
  #location: WorkbenchLocation
  readonly #store: WorkbenchStore
  readonly #view = val<WorkbenchView>('design')
  #change = 0
  #disposed = false
  #ready = false
  #syncing = false
  readonly #stopReactions: (() => void)[] = []

  public readonly $: { readonly view: ReadonlyVal<WorkbenchView> } = { view: this.#view }

  public constructor(store: WorkbenchStore, location: WorkbenchLocation, navigate: (location: WorkbenchLocation, options: WorkbenchNavigationOptions) => void) {
    this.#location = location
    this.#navigate = navigate
    this.#store = store
    this.#view.set(location.view)
  }

  public async start(): Promise<void> {
    const location = this.#location
    const change = ++this.#change
    this.#syncing = true
    this.#stopReactions.push(this.#store.workspace.$.projectId.reaction(this.#sync), this.#store.workspace.$.targetFlow.reaction(this.#sync))
    await this.#store.start(location.projectId, location.flowId)
    if (this.#disposed || change != this.#change) return
    this.#write(location.view, true)
    this.#syncing = false
    this.#ready = true
  }

  public dispose(): void {
    this.#disposed = true
    for (const stop of this.#stopReactions) stop()
    this.#view.dispose()
  }

  public open(view: WorkbenchView): void {
    this.#change += 1
    this.#syncing = false
    this.#write(view, false)
  }

  public async createProject(name: string): Promise<boolean> {
    const change = ++this.#change
    this.#syncing = true
    try {
      const created = await this.#store.createProject(name)
      if (created && change == this.#change) this.#write('design', false)
      return created
    } finally {
      if (change == this.#change) this.#syncing = false
    }
  }

  public async createFlow(name: string): Promise<boolean> {
    const change = ++this.#change
    this.#syncing = true
    try {
      const created = await this.#store.workspace.createResource('flow', name)
      if (created && change == this.#change) this.#write('design', false)
      return created
    } finally {
      if (change == this.#change) this.#syncing = false
    }
  }

  public selectFlow(flow: Flow): void {
    this.#change += 1
    this.#syncing = true
    if (!this.#store.workspace.selectTarget({ id: flow.flowId, kind: 'flow' })) {
      this.#syncing = false
      return
    }
    this.#store.runRequests.dismissInputs()
    this.#write(flow.draft == null ? 'publications' : 'design', false)
    this.#syncing = false
  }

  public async selectProject(projectId: string): Promise<void> {
    const change = ++this.#change
    this.#syncing = true
    const selected = this.#store.selectProject(projectId)
    this.#write('design', false)
    try {
      await selected
    } finally {
      if (change == this.#change) this.#syncing = false
    }
  }

  public openProject(): void {
    this.#change += 1
    this.#syncing = true
    if (!this.#store.workspace.selectTarget(undefined)) {
      this.#syncing = false
      return
    }
    this.#store.runRequests.dismissInputs()
    this.#write('design', false)
    this.#syncing = false
  }

  public async openProjects(): Promise<void> {
    const change = ++this.#change
    this.#syncing = true
    const loading = this.#store.start()
    this.#write('design', false)
    try {
      await loading
    } finally {
      if (change == this.#change) this.#syncing = false
    }
  }

  public async apply(location: WorkbenchLocation): Promise<void> {
    if (sameLocation(location, this.#location)) return
    this.#location = location
    await this.#apply(location)
  }

  readonly #sync = (): void => {
    if (this.#ready && !this.#syncing) this.#write(this.#view.value, true)
  }

  async #apply(location: WorkbenchLocation): Promise<void> {
    const change = ++this.#change
    this.#syncing = true
    try {
      if (location.projectId == null) {
        await this.#store.start()
      } else if (location.projectId != this.#store.workspace.$.projectId.value) {
        await this.#store.selectProject(location.projectId, location.flowId)
      } else if (location.flowId == null) {
        this.#store.workspace.selectTarget(undefined)
      } else if (location.flowId != null && location.flowId != this.#store.workspace.$.targetFlow.value?.flowId) {
        const flow = this.#store.workspace.$.flows.value.find((candidate) => candidate.flowId == location.flowId)
        this.#store.workspace.selectTarget(flow == null ? undefined : { id: flow.flowId, kind: 'flow' })
      }
      if (change == this.#change) this.#write(location.view, true)
    } finally {
      if (change == this.#change) {
        this.#syncing = false
        this.#ready = true
      }
    }
  }

  #write(requestedView: WorkbenchView, replace: boolean): void {
    const flow = this.#store.workspace.$.targetFlow.value
    const view = availableView(requestedView, flow)
    const location = { flowId: flow?.flowId, projectId: this.#store.workspace.$.projectId.value, view }
    if (!sameLocation(location, this.#location)) {
      this.#location = location
      this.#navigate(location, { replace })
    }
    this.#view.set(view)
  }
}

function sameLocation(left: WorkbenchLocation, right: WorkbenchLocation): boolean {
  return left.projectId == right.projectId && left.flowId == right.flowId && left.view == right.view
}
