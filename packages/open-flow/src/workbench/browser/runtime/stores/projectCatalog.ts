import type { I18n } from 'val-i18n'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { WorkbenchClient, Project } from '../api.ts'
import type { Current } from './latest.ts'
import type { SetNotice } from './workbenchNotice.ts'

import { derive, val } from 'value-enhancer'
import { Latest } from './latest.ts'
import { errorNotice } from './workbenchNotice.ts'

const pageLimit = 50

interface State {
  readonly failed: boolean
  readonly loaded: boolean
  readonly loading: boolean
  readonly loadingMore: boolean
  readonly loadMoreFailed: boolean
  readonly nextCursor?: string
  readonly projects: readonly Project[]
  readonly total?: number
}

export interface ProjectCatalog$ {
  readonly failed: ReadonlyVal<boolean>
  readonly loading: ReadonlyVal<boolean>
  readonly loadingMore: ReadonlyVal<boolean>
  readonly loadMoreFailed: ReadonlyVal<boolean>
  readonly nextCursor: ReadonlyVal<string | undefined>
  readonly projects: ReadonlyVal<readonly Project[]>
  readonly total: ReadonlyVal<number | undefined>
}

const initialState: State = {
  failed: false,
  loaded: false,
  loading: true,
  loadingMore: false,
  loadMoreFailed: false,
  projects: [],
}

export class ProjectCatalog {
  readonly #client: WorkbenchClient
  readonly #i18n: I18n
  readonly #session = new Latest()
  readonly #setNotice: SetNotice
  readonly #state: Val<State> = val(initialState)
  #disposed = false
  public readonly $: ProjectCatalog$

  public constructor(client: WorkbenchClient, setNotice: SetNotice, i18n: I18n) {
    this.#client = client
    this.#i18n = i18n
    this.#setNotice = setNotice
    this.$ = {
      failed: derive(this.#state, (state) => state.failed),
      loading: derive(this.#state, (state) => state.loading),
      loadingMore: derive(this.#state, (state) => state.loadingMore),
      loadMoreFailed: derive(this.#state, (state) => state.loadMoreFailed),
      nextCursor: derive(this.#state, (state) => state.nextCursor),
      projects: derive(this.#state, (state) => state.projects),
      total: derive(this.#state, (state) => state.total),
    }
  }

  public get loaded(): boolean {
    return this.#state.value.loaded
  }

  public dispose(): void {
    this.#disposed = true
    this.#session.invalidate()
    for (const value of Object.values(this.$)) value.dispose()
    this.#state.dispose()
  }

  public beginSelection(): Current {
    const current = this.#session.begin()
    this.#set({ loading: false })
    return current
  }

  public capture(): Current {
    return this.#session.capture()
  }

  public project(projectId: string): Project | undefined {
    return this.#state.value.projects.find((project) => project.projectId == projectId)
  }

  public async reload(): Promise<void> {
    const current = this.#session.begin()
    this.#set({
      failed: false,
      loaded: false,
      loading: true,
      loadingMore: false,
      loadMoreFailed: false,
      nextCursor: undefined,
      projects: [],
      total: undefined,
    })
    try {
      const page = await this.#client.listProjects({ includeTotal: true, limit: pageLimit })
      if (!current()) return
      this.#set({
        loaded: true,
        loading: false,
        nextCursor: page.nextCursor,
        projects: page.projects,
        total: page.total,
      })
    } catch (error) {
      if (!current()) return
      this.#set({ failed: true, loading: false })
      this.#setNotice(errorNotice(error, this.#i18n.t))
    }
  }

  public async loadMore(): Promise<void> {
    const { loadingMore, nextCursor } = this.#state.value
    if (loadingMore || nextCursor == null) return
    const current = this.#session.capture()
    this.#set({ loadingMore: true, loadMoreFailed: false })
    try {
      const page = await this.#client.listProjects({ cursor: nextCursor, limit: pageLimit })
      if (!current()) return
      const seen = new Set(this.#state.value.projects.map((project) => project.projectId))
      this.#set({
        loadingMore: false,
        nextCursor: page.nextCursor,
        projects: [...this.#state.value.projects, ...page.projects.filter((project) => !seen.has(project.projectId))],
      })
    } catch (error) {
      if (!current()) return
      this.#set({ loadingMore: false, loadMoreFailed: true })
      this.#setNotice(errorNotice(error, this.#i18n.t))
    }
  }

  public async create(name: string): Promise<Project | undefined> {
    const project = await this.#client.createProject(name)
    if (this.#disposed) return
    this.#set({
      projects: [...this.#state.value.projects, project],
      total: this.#state.value.total == null ? undefined : this.#state.value.total + 1,
    })
    return project
  }

  public include(project: Project): void {
    if (this.project(project.projectId) == null) this.#set({ projects: [...this.#state.value.projects, project] })
  }

  public remove(projectId: string): void {
    this.#set({
      projects: this.#state.value.projects.filter((project) => project.projectId != projectId),
      total: this.#state.value.total == null ? undefined : this.#state.value.total - 1,
    })
  }

  public advanceHead(projectId: string, revisionId: string): void {
    this.#set({
      projects: this.#state.value.projects.map((project) => (project.projectId == projectId ? { ...project, draftRevisionId: revisionId } : project)),
    })
  }

  #set(patch: Partial<State>): void {
    if (!this.#disposed) this.#state.set({ ...this.#state.value, ...patch })
  }
}
