import type { I18n } from 'val-i18n'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { TriggerSettings } from '../../../../project/common/nodeChanges.ts'
import type { WorkbenchClient, ConnectorConnection, TriggerKeySnapshot } from '../api.ts'
import type { WorkbenchHost } from '../contract.ts'
import type { AddNodeOption } from '../designer/addNodeOptions.ts'
import type { ResolvedSelection } from '../revisionView.ts'
import type { ConnectionCatalog } from '../workspace.ts'
import type { SetNotice } from './workbenchNotice.ts'
import type { WorkspaceStore } from './workspaceStore.ts'

import { compute, derive, val } from 'value-enhancer'
import { createI18n } from '../i18n.ts'
import { connectionCatalog } from '../workspace.ts'
import { Latest } from './latest.ts'
import { errorNotice } from './workbenchNotice.ts'

interface TriggerState {
  readonly authorizationProvider?: string
  readonly catalogs: Readonly<Record<string, ConnectionCatalog>>
  readonly connectionError?: { readonly message: string; readonly provider: string }
  readonly connectionLoading?: string
}

interface TriggerTarget {
  readonly connectionId?: string
  readonly provider: string
  readonly triggerId: string
}

interface Selection {
  readonly activeConnections?: readonly ConnectorConnection[]
  readonly authorizationPending: boolean
  readonly connection?: ConnectorConnection
  readonly connectionError?: string
  readonly definition?: TriggerKeySnapshot
}

export interface Trigger$ {
  readonly connectionLoading: ReadonlyVal<string | undefined>
  readonly selectedActiveConnections: ReadonlyVal<readonly ConnectorConnection[] | undefined>
  readonly selectedAuthorizationPending: ReadonlyVal<boolean>
  readonly selectedConnection: ReadonlyVal<ConnectorConnection | undefined>
  readonly selectedConnectionError: ReadonlyVal<string | undefined>
  readonly selectedDefinition: ReadonlyVal<TriggerKeySnapshot | undefined>
}

const initialState: TriggerState = { catalogs: {} }
const connectionBatchSize = 4
const optionPrefix = 'trigger:'

function target(selection: ResolvedSelection | undefined, workspace: WorkspaceStore): TriggerTarget | undefined {
  if (selection?.kind != 'trigger') return
  const trigger = selection.trigger
  if (trigger.kind != 'poll' && trigger.kind != 'integration') return
  const binding = workspace.$.revision.value?.binding(trigger.bindingId)
  return {
    ...(binding?.kind == 'connection' ? { connectionId: binding.target } : {}),
    provider: trigger.definition.provider,
    triggerId: selection.id,
  }
}

function concreteOption(definition: TriggerKeySnapshot, connectionId: string, description: string, group: string): AddNodeOption {
  return {
    description,
    group,
    id: `trigger:${definition.key}:${connectionId}`,
    inputs: [],
    kind: 'trigger',
    label: definition.displayName,
    outputs: [{ handle: 'payload', jsonSchema: definition.payloadSchema }],
    trigger: { connectionId, definition, kind: 'catalog' },
  }
}

function option(definition: TriggerKeySnapshot, i18n: I18n): AddNodeOption {
  return {
    choices: [],
    description: i18n.t('addNode.triggerChooseConnection'),
    group: i18n.t('addNode.triggers'),
    id: `${optionPrefix}${definition.key}`,
    inputs: [],
    kind: 'trigger',
    label: definition.displayName,
    outputs: [],
  }
}

function choices(definition: TriggerKeySnapshot, catalog: ConnectionCatalog, i18n: I18n): readonly AddNodeOption[] {
  const group = i18n.t('addNode.triggers')
  const preferred = catalog.preferred
  if (preferred != null) return [concreteOption(definition, preferred.connectionId, preferred.displayName, group)]
  if (catalog.active.length > 0) {
    return catalog.active.map((connection) => concreteOption(definition, connection.connectionId, connection.displayName, group))
  }
  return [
    {
      description: i18n.t('addNode.triggerNeedsConnection', { provider: definition.provider }),
      group,
      id: `${optionPrefix}${definition.key}:connect`,
      inputs: [],
      kind: 'trigger',
      label: i18n.t('addNode.triggerAddConnection'),
      outputs: [],
      trigger: { kind: 'connect', provider: definition.provider },
    },
  ]
}

function resolvedOption(definition: TriggerKeySnapshot, catalog: ConnectionCatalog, i18n: I18n): AddNodeOption {
  const preferred = catalog.preferred
  if (preferred != null) return concreteOption(definition, preferred.connectionId, preferred.displayName, i18n.t('addNode.triggers'))
  const base = option(definition, i18n)
  const options = choices(definition, catalog, i18n)
  return {
    ...base,
    description: catalog.active.length == 0 ? i18n.t('addNode.triggerNeedsConnection', { provider: definition.provider }) : base.description,
    outputs: catalog.active.length == 0 ? [] : [{ handle: 'payload', jsonSchema: definition.payloadSchema }],
    choices: options.map((child) => ({
      description: catalog.active.length == 0 ? definition.provider : undefined,
      label: child.label,
      option: child,
    })),
  }
}

export class TriggerStore {
  #catalog?: Promise<ReadonlyMap<string, TriggerKeySnapshot>>
  #catalogController = new AbortController()
  readonly #client: WorkbenchClient
  readonly #host: Pick<WorkbenchHost, 'openExternalPage'>
  readonly #i18n: I18n
  readonly #refresh = new Latest()
  readonly #selected: ReadonlyVal<Selection>
  readonly #setNotice: SetNotice
  readonly #state: Val<TriggerState> = val(initialState)
  readonly #workspace: WorkspaceStore
  #disposed = false

  public readonly $: Trigger$

  public constructor(
    client: WorkbenchClient,
    workspace: WorkspaceStore,
    setNotice: SetNotice,
    host: Pick<WorkbenchHost, 'openExternalPage'>,
    i18n: I18n = createI18n(),
  ) {
    this.#client = client
    this.#host = host
    this.#i18n = i18n
    this.#setNotice = setNotice
    this.#workspace = workspace
    this.#selected = compute((get) => {
      const selection = get(workspace.$.selection)
      const current = target(selection, workspace)
      const state = get(this.#state)
      if (selection?.kind != 'trigger') return { authorizationPending: false }
      const trigger = selection.trigger
      if (trigger.kind != 'poll' && trigger.kind != 'integration') return { authorizationPending: false }
      const catalog = current == null ? undefined : state.catalogs[current.provider]
      const connectionError = state.connectionError
      return {
        activeConnections: catalog?.active,
        authorizationPending: state.authorizationProvider == current?.provider,
        connection: current?.connectionId == null ? undefined : catalog?.byId.get(current.connectionId),
        connectionError: connectionError != null && connectionError.provider == current?.provider ? connectionError.message : undefined,
        definition: trigger.definition,
      }
    })
    this.$ = {
      connectionLoading: derive(this.#state, (state) => state.connectionLoading),
      selectedActiveConnections: derive(this.#selected, (selection) => selection.activeConnections),
      selectedAuthorizationPending: derive(this.#selected, (selection) => selection.authorizationPending),
      selectedConnection: derive(this.#selected, (selection) => selection.connection),
      selectedConnectionError: derive(this.#selected, (selection) => selection.connectionError),
      selectedDefinition: derive(this.#selected, (selection) => selection.definition),
    }
  }

  public dispose(): void {
    this.#disposed = true
    this.#catalogController.abort()
    this.#refresh.invalidate()
    for (const value of Object.values(this.$)) value.dispose()
    this.#selected.dispose()
    this.#state.dispose()
  }

  public reset(): void {
    if (this.#disposed) return
    this.#catalogController.abort()
    this.#catalogController = new AbortController()
    this.#catalog = undefined
    this.#refresh.invalidate()
    this.#state.set(initialState)
  }

  public readonly browseAddNodeOptions = async (signal: AbortSignal): Promise<readonly AddNodeOption[] | undefined> => {
    const projectId = this.#workspace.$.projectId.value
    if (signal.aborted || this.#disposed || projectId == null || this.#workspace.$.target.value?.kind != 'flow') return []
    const definitions = await this.#loadCatalog()
    if (signal.aborted || this.#disposed || projectId != this.#workspace.$.projectId.value) return
    return [...definitions.values()].map((definition) => option(definition, this.#i18n))
  }

  public readonly provideAddNodeOptions = async (searchTerm: string, signal: AbortSignal): Promise<readonly AddNodeOption[] | undefined> => {
    const projectId = this.#workspace.$.projectId.value
    if (signal.aborted || this.#disposed || projectId == null || this.#workspace.$.target.value?.kind != 'flow') return []
    const query = searchTerm.trim().toLowerCase()
    if (query.length == 0) return []
    const catalog = await this.#loadCatalog()
    if (signal.aborted || this.#disposed || projectId != this.#workspace.$.projectId.value) return
    const definitions = [...catalog.values()].filter((item) =>
      [item.description, item.displayName, item.key, item.name, item.provider, item.type].some((value) => value.toLowerCase().includes(query)),
    )
    const providers = [...new Set(definitions.map((definition) => definition.provider))].filter((provider) => this.#state.value.catalogs[provider] == null)
    for (let index = 0; index < providers.length; index += connectionBatchSize) {
      const loaded = await Promise.all(
        providers
          .slice(index, index + connectionBatchSize)
          .map(async (provider) => [provider, connectionCatalog(await this.#client.listConnectorConnections(projectId, provider, signal))] as const),
      )
      if (signal.aborted || this.#disposed || projectId != this.#workspace.$.projectId.value) return
      this.#set({ catalogs: { ...this.#state.value.catalogs, ...Object.fromEntries(loaded) } })
    }
    return definitions.map((definition) => resolvedOption(definition, this.#state.value.catalogs[definition.provider]!, this.#i18n))
  }

  public readonly provideAddNodeOptionChoices = async (optionId: string, signal: AbortSignal): Promise<readonly AddNodeOption[] | undefined> => {
    const projectId = this.#workspace.$.projectId.value
    const key = optionId.startsWith(optionPrefix) ? optionId.slice(optionPrefix.length) : undefined
    if (signal.aborted || this.#disposed || projectId == null || key == null || this.#workspace.$.target.value?.kind != 'flow') return
    const definition = (await this.#loadCatalog()).get(key)
    if (signal.aborted || this.#disposed || projectId != this.#workspace.$.projectId.value || definition == null) return
    let catalog = this.#state.value.catalogs[definition.provider]
    if (catalog == null) {
      catalog = connectionCatalog(await this.#client.listConnectorConnections(projectId, definition.provider, signal))
      if (signal.aborted || this.#disposed || projectId != this.#workspace.$.projectId.value) return
      this.#set({ catalogs: { ...this.#state.value.catalogs, [definition.provider]: catalog } })
    }
    return choices(definition, catalog, this.#i18n)
  }

  public async refresh(force = false): Promise<void> {
    const current = this.#refresh.begin()
    const projectId = this.#workspace.$.projectId.value
    const selected = target(this.#workspace.$.selection.value, this.#workspace)
    if (this.#disposed) return
    if (projectId == null || selected == null) {
      if (this.#state.value.connectionLoading != null) this.#set({ connectionLoading: undefined })
      return
    }
    if (!force && this.#state.value.catalogs[selected.provider] != null) return
    this.#set({ connectionError: undefined, connectionLoading: selected.provider })
    try {
      const catalog = connectionCatalog(await this.#client.listConnectorConnections(projectId, selected.provider))
      if (!this.#current(current, projectId)) return
      this.#set({ catalogs: { ...this.#state.value.catalogs, [selected.provider]: catalog } })
    } catch (error) {
      if (this.#current(current, projectId)) {
        this.#set({ connectionError: { message: errorNotice(error, this.#i18n.t).message, provider: selected.provider } })
      }
    } finally {
      if (this.#current(current, projectId) && this.#state.value.connectionLoading == selected.provider) this.#set({ connectionLoading: undefined })
    }
  }

  public async connect(provider: string): Promise<void> {
    const projectId = this.#workspace.$.projectId.value
    if (this.#disposed || projectId == null) return
    try {
      const opened = await this.#host.openExternalPage(() => this.#client.createConnectorConnectionPage(projectId, provider))
      if (!opened) {
        this.#setNotice({ kind: 'error', message: this.#i18n.t('notice.connectionPopupBlocked') })
        return
      }
      if (!this.#disposed && projectId == this.#workspace.$.projectId.value) this.#set({ authorizationProvider: provider })
    } catch (error) {
      if (!this.#disposed) this.#setNotice(errorNotice(error, this.#i18n.t))
    }
  }

  public async setConnection(triggerId: string, connectionId: string): Promise<boolean> {
    return await this.#workspace.setTriggerConnection(triggerId, connectionId)
  }

  public async saveSettings(triggerId: string, settings: TriggerSettings): Promise<boolean> {
    return await this.#workspace.saveTriggerSettings(triggerId, settings)
  }

  public async refreshAfterAuthorization(): Promise<void> {
    const provider = this.#state.value.authorizationProvider
    if (this.#disposed || provider == null) return
    const catalogs = { ...this.#state.value.catalogs }
    delete catalogs[provider]
    this.#set({ authorizationProvider: undefined, catalogs })
    if (target(this.#workspace.$.selection.value, this.#workspace)?.provider == provider) await this.refresh(true)
  }

  #loadCatalog(): Promise<ReadonlyMap<string, TriggerKeySnapshot>> {
    if (this.#catalog != null) return this.#catalog
    const request = this.#client
      .listTriggerDefinitions(this.#catalogController.signal)
      .then((definitions) => new Map(definitions.map((definition) => [definition.key, definition])))
    this.#catalog = request
    void request.catch(() => {
      if (this.#catalog == request) this.#catalog = undefined
    })
    return request
  }

  #set(patch: Partial<TriggerState>): void {
    if (!this.#disposed) this.#state.set({ ...this.#state.value, ...patch })
  }

  #current(current: () => boolean, projectId: string): boolean {
    return !this.#disposed && current() && projectId == this.#workspace.$.projectId.value
  }
}
