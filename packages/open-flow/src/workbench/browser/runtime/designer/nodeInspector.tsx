import type { ReactElement } from 'react'
import type { TFunction } from 'val-i18n'
import type { TriggerSettings } from '../../../../project/common/nodeChanges.ts'
import type { ConditionNode, ConnectorAction, ConnectorConnection, Diagnostic, JsonValue } from '../api.ts'
import type { IconName } from '../icons.tsx'
import type { ResolvedNode, ResolvedSelection, RevisionView } from '../revisionView.ts'
import type { ConnectorStore } from '../stores/connectorStore.ts'
import type { TriggerStore } from '../stores/triggerStore.ts'
import type { ModuleEditorStatus } from '../stores/workspaceModel.ts'
import type { WorkspaceStore } from '../stores/workspaceStore.ts'
import type { DiagnosticFocus } from './diagnostics.ts'
import type { ConditionSettings, DesignerTarget, TaskSettings } from './projectChanges.ts'

import { useEffect, useRef, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { Icon } from '../icons.tsx'
import { CodeEditor } from './codeEditor.tsx'

export function inspectorIcon(node: ResolvedSelection | undefined, target: DesignerTarget): IconName {
  if (node?.kind == 'trigger') return 'trigger'
  if (node?.kind == 'condition') return 'condition'
  if (node?.kind == 'value') return 'value'
  if (node?.kind == 'subflow' || (node == null && target.kind == 'subflow')) return 'subflow'
  if (node?.kind == 'task' && node.definition != null && 'executor' in node.definition) {
    return node.definition.executor.kind == 'llm' ? 'llm' : 'connection'
  }
  return 'task'
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function objectValue(value: string, label: string, t: TFunction): Readonly<Record<string, never>> {
  const parsed = JSON.parse(value) as unknown
  if (parsed == null || typeof parsed != 'object' || Array.isArray(parsed)) throw new TypeError(t('inspector.errors.jsonObject', { label }))
  return parsed as Readonly<Record<string, never>>
}

function codeStatusLabel(status: ModuleEditorStatus, t: TFunction): string {
  switch (status) {
    case 'dirty':
      return t('inspector.task.codeDirty')
    case 'failed':
      return t('inspector.task.codeFailed')
    case 'saved':
      return t('inspector.task.codeSaved')
    case 'saving':
      return t('inspector.task.codeSaving')
  }
}

function Diagnostics({ diagnostics }: { readonly diagnostics: readonly Diagnostic[] }): ReactElement | null {
  const t = useTranslate()
  if (diagnostics.length == 0) return null
  const incomplete = diagnostics.every((diagnostic) => diagnostic.code == 'trigger.config-incomplete')
  return (
    <section className={`inspector-section diagnostics-section ${incomplete ? 'incomplete' : ''}`}>
      <h3>
        <Icon name="alert" size={15} /> {t(incomplete ? 'inspector.configurationRequired' : 'inspector.diagnostics')}
      </h3>
      <div className="diagnostic-list">
        {diagnostics.map((diagnostic, index) => (
          <div className="diagnostic-item" key={`${diagnostic.path}:${diagnostic.line}:${diagnostic.column}:${index}`}>
            <strong>{diagnostic.message}</strong>
            <code>
              {diagnostic.code} · {diagnostic.line}:{diagnostic.column}
            </code>
          </div>
        ))}
      </div>
    </section>
  )
}

function GeneralSettings({
  disabled,
  node,
  nodeId,
  store,
}: {
  readonly disabled: boolean
  readonly node: ResolvedNode['node']
  readonly nodeId: string
  readonly store: WorkspaceStore
}): ReactElement {
  const t = useTranslate()
  const [name, setName] = useState(node.name ?? '')
  const [concurrency, setConcurrency] = useState(String(node.concurrency))
  const [timeout, setTimeoutValue] = useState(node.timeoutMs == null ? '' : String(node.timeoutMs))
  const [error, setError] = useState<string>()

  useEffect(() => {
    setName(node.name ?? '')
    setConcurrency(String(node.concurrency))
    setTimeoutValue(node.timeoutMs == null ? '' : String(node.timeoutMs))
    setError(undefined)
  }, [node])

  return (
    <details className="inspector-disclosure" data-inspector-section="node">
      <summary>
        <Icon name="chevron-down" size={14} />
        <span className="inspector-disclosure-summary">
          <strong>{t('inspector.node.title')}</strong>
          <span>{t('inspector.node.description')}</span>
        </span>
      </summary>
      <form
        className="inspector-form inspector-disclosure-content"
        onSubmit={(event) => {
          event.preventDefault()
          const concurrencyValue = Number(concurrency)
          const timeoutValue = timeout == '' ? undefined : Number(timeout)
          if (!Number.isInteger(concurrencyValue) || concurrencyValue < 1) {
            setError(t('inspector.node.concurrencyError'))
            return
          }
          if (timeoutValue != null && (!Number.isInteger(timeoutValue) || timeoutValue < 1)) {
            setError(t('inspector.node.timeoutError'))
            return
          }
          setError(undefined)
          void store.saveNodeSettings(nodeId, {
            concurrency: concurrencyValue,
            ...(name.trim() == '' ? {} : { name: name.trim() }),
            ...(timeoutValue == null ? {} : { timeoutMs: timeoutValue }),
          })
        }}
      >
        <label>
          {t('inspector.node.displayName')}
          <input disabled={disabled} onChange={(event) => setName(event.target.value)} placeholder={t('inspector.node.displayNamePlaceholder')} value={name} />
        </label>
        <div className="field-pair">
          <label>
            {t('inspector.node.concurrency')}
            <input disabled={disabled} min="1" onChange={(event) => setConcurrency(event.target.value)} type="number" value={concurrency} />
          </label>
          <label>
            {t('inspector.node.timeout')}
            <input
              disabled={disabled}
              min="1"
              onChange={(event) => setTimeoutValue(event.target.value)}
              placeholder={t('common.default')}
              type="number"
              value={timeout}
            />
          </label>
        </div>
        {error != null && <p className="form-error">{error}</p>}
        <div className="form-actions">
          <button className="button secondary small" disabled={disabled} type="submit">
            {t('inspector.node.save')}
          </button>
        </div>
      </form>
    </details>
  )
}

function TaskDefinition({
  children,
  connectorAction,
  connectorActionError,
  connectorAuthorizationPending,
  connectorConnection,
  connectorConnectionError,
  activeConnectorConnections,
  connectors,
  connectorLoading,
  disabled,
  focus,
  selection,
  store,
}: {
  readonly children: ReactElement
  readonly connectorAction: ConnectorAction | undefined
  readonly connectorActionError: string | undefined
  readonly connectorAuthorizationPending: boolean
  readonly connectorConnection: ConnectorConnection | undefined
  readonly connectorConnectionError: string | undefined
  readonly activeConnectorConnections: readonly ConnectorConnection[] | undefined
  readonly connectors: ConnectorStore
  readonly connectorLoading: boolean
  readonly disabled: boolean
  readonly focus?: DiagnosticFocus
  readonly selection: Extract<ResolvedNode, { readonly kind: 'task' }>
  readonly store: WorkspaceStore
}): ReactElement | null {
  const t = useTranslate()
  const node = selection.node
  const taskId = node.task == null ? node.taskId : undefined
  const task = selection.definition
  const module = selection.module
  const [name, setName] = useState(task?.name ?? '')
  const [llmMode, setLlmMode] = useState<'chat' | 'json'>(task != null && 'executor' in task && task.executor.kind == 'llm' ? task.executor.mode : 'chat')
  const [inputs, setInputs] = useState(json(task?.inputs ?? {}))
  const [outputs, setOutputs] = useState(json(task?.outputs ?? {}))
  const [definitionError, setDefinitionError] = useState<string>()
  const moduleDiagnostics = useVal(store.$.moduleDiagnostics)
  const moduleEditor = useVal(store.$.moduleEditor)
  const moduleLocation = focus?.section == 'module' ? focus.diagnostic : focus == null ? moduleDiagnostics[0] : undefined

  useEffect(() => {
    setName(task?.name ?? '')
    setLlmMode(task != null && 'executor' in task && task.executor.kind == 'llm' ? task.executor.mode : 'chat')
    setInputs(json(task?.inputs ?? {}))
    setOutputs(json(task?.outputs ?? {}))
    setDefinitionError(undefined)
  }, [module, task])

  if (task == null) return <div className="inspector-section section-error">{t('inspector.task.missing')}</div>
  const connector = 'executor' in task && task.executor.kind == 'connector' ? task.executor : undefined
  const activeConnections = activeConnectorConnections ?? []
  const connectionRequired =
    connector != null && (connector.connectionId == null || (activeConnectorConnections != null && connectorConnection?.status != 'active'))
  return (
    <>
      {connector != null && (
        <section className={`inspector-section connection-state ${connectionRequired ? 'required' : ''}`} data-inspector-section="account">
          <h3>
            <Icon name="connection" size={15} /> {t('inspector.account.title')}
          </h3>
          {connectorLoading ? (
            <p>{t('inspector.account.loading')}</p>
          ) : connectorActionError != null || connectorAction == null ? (
            <>
              <p>{connectorActionError ?? t('inspector.account.statusUnavailable', { action: connector.action })}</p>
              <button className="button secondary small" disabled={disabled} onClick={() => void connectors.refresh(true)} type="button">
                {t('inspector.account.retry')}
              </button>
            </>
          ) : connectorConnectionError != null ? (
            <>
              <p>{t('inspector.account.refreshFailed')}</p>
              <p className="connection-detail">{connectorConnectionError}</p>
              <button className="button secondary small" disabled={disabled} onClick={() => void connectors.refresh(true)} type="button">
                {t('inspector.account.retry')}
              </button>
            </>
          ) : connector.connectionId == null ? (
            activeConnections.length > 0 ? (
              <>
                {connectorAuthorizationPending && <p>{t('inspector.account.authorizationPending')}</p>}
                <div className="connection-field">
                  <span>{t('inspector.account.connection')}</span>
                  <div className="select-wrap">
                    <select
                      aria-label={t('inspector.account.connection')}
                      disabled={disabled}
                      onChange={(event) => void connectors.setConnection(taskId!, event.target.value)}
                      value=""
                    >
                      <option disabled value="">
                        {t('inspector.account.chooseAccount')}
                      </option>
                      {activeConnections.map((connection) => (
                        <option key={connection.connectionId} value={connection.connectionId}>
                          {connection.displayName}
                          {connection.isDefault ? ` (${t('inspector.account.teamDefault')})` : ''}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevron-down" size={15} />
                  </div>
                </div>
                <button className="button secondary small" disabled={disabled} onClick={() => void connectors.connect(connectorAction.serviceId)} type="button">
                  <Icon name="plus" size={14} /> {t('inspector.account.addConnection')}
                </button>
              </>
            ) : (
              <>
                {connectorAuthorizationPending && <p>{t('inspector.account.authorizationPending')}</p>}
                <p>{t('inspector.account.connectBeforeRun', { service: connectorAction.serviceName })}</p>
                <button className="button primary small" disabled={disabled} onClick={() => void connectors.connect(connectorAction.serviceId)} type="button">
                  {t('inspector.account.connectService', { service: connectorAction.serviceName })}
                </button>
              </>
            )
          ) : (
            <>
              {connectorAuthorizationPending && <p>{t('inspector.account.authorizationPending')}</p>}
              <div className="connection-field">
                <span>{t('inspector.account.connection')}</span>
                <div className="select-wrap">
                  <select
                    aria-label={t('inspector.account.connection')}
                    disabled={disabled || activeConnections.length == 0}
                    onChange={(event) => void connectors.setConnection(taskId!, event.target.value)}
                    value={connector.connectionId}
                  >
                    {connectorConnection?.status != 'active' && (
                      <option disabled value={connector.connectionId}>
                        {connectorConnection?.displayName ?? connector.connectionId} ({t('inspector.account.unavailable')})
                      </option>
                    )}
                    {activeConnections.map((connection) => (
                      <option key={connection.connectionId} value={connection.connectionId}>
                        {connection.displayName}
                        {connection.isDefault ? ` (${t('inspector.account.teamDefault')})` : ''}
                      </option>
                    ))}
                  </select>
                  <Icon name="chevron-down" size={15} />
                </div>
              </div>
              {connectorConnection == null ? (
                <p>{t('inspector.account.missing')}</p>
              ) : connectorConnection.status == 'active' ? (
                <p>{t('inspector.account.pinned')}</p>
              ) : (
                <p>{t(`inspector.account.status.${connectorConnection.status}`)}</p>
              )}
              <button className="button secondary small" disabled={disabled} onClick={() => void connectors.connect(connectorAction.serviceId)} type="button">
                <Icon name="plus" size={14} /> {t('inspector.account.addConnection')}
              </button>
            </>
          )}
        </section>
      )}
      {module != null && 'moduleId' in task && moduleEditor?.moduleId == task.moduleId && (
        <form
          className="inspector-section inspector-form code-section"
          data-inspector-section="module"
          onSubmit={(event) => {
            event.preventDefault()
            void store.saveModuleEditor()
          }}
        >
          <div className="code-section-heading">
            <h3>{t('inspector.task.javascriptModule')}</h3>
            <span className={`code-save-status ${moduleEditor.status}`} aria-live="polite">
              <span /> {codeStatusLabel(moduleEditor.status, t)}
            </span>
          </div>
          <CodeEditor
            ariaLabel={t('inspector.task.source')}
            disabled={disabled || moduleEditor.status == 'saving'}
            errorLabel={t('inspector.task.editorUnavailable')}
            loadingLabel={t('inspector.task.editorLoading')}
            location={moduleLocation == null ? undefined : { column: moduleLocation.column, line: moduleLocation.line }}
            onChange={(value) => store.updateModuleSource(value)}
            uri={`open-flow://project/modules/${moduleEditor.moduleId}.js`}
            value={moduleEditor.source}
          />
          <span className="code-source-note">{t('inspector.task.importsFromSource')}</span>
          <div className="form-actions">
            {(moduleEditor.status == 'dirty' || moduleEditor.status == 'failed') && (
              <button className="button secondary small" disabled={disabled} onClick={() => store.discardModuleChanges()} type="button">
                {t('inspector.task.discardCode')}
              </button>
            )}
            <button className="button primary small" disabled={disabled || moduleEditor.status == 'saved' || moduleEditor.status == 'saving'} type="submit">
              {t('inspector.task.saveCode')}
            </button>
          </div>
        </form>
      )}
      {children}
      <details className="inspector-disclosure" data-inspector-section="task">
        <summary>
          <Icon name="chevron-down" size={14} />
          <span className="inspector-disclosure-summary">
            <strong>{t('inspector.task.definition')}</strong>
            <span>{t('inspector.task.definitionDescription')}</span>
          </span>
        </summary>
        <form
          className="inspector-form inspector-disclosure-content"
          onSubmit={(event) => {
            event.preventDefault()
            try {
              const nextInputs = objectValue(inputs, t('inspector.task.inputPorts'), t)
              const nextOutputs = objectValue(outputs, t('inspector.task.outputPorts'), t)
              let settings: TaskSettings
              if ('moduleId' in task) {
                settings = {
                  inputs: nextInputs,
                  kind: 'code',
                  name: name.trim(),
                  outputs: nextOutputs,
                }
              } else if (task.executor.kind == 'llm') {
                settings = {
                  inputs: nextInputs,
                  kind: 'llm',
                  mode: llmMode,
                  name: name.trim(),
                  outputs: nextOutputs,
                }
              } else {
                settings = {
                  inputs: nextInputs,
                  kind: 'connector',
                  name: name.trim(),
                  outputs: nextOutputs,
                }
              }
              setDefinitionError(undefined)
              void store.saveTaskSettings(selection.id, settings)
            } catch (error) {
              setDefinitionError(error instanceof TypeError ? error.message : t('inspector.errors.portDefinitions'))
            }
          }}
        >
          <label>
            {t('common.name')}
            <input disabled={disabled} onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          {'executor' in task && task.executor.kind == 'llm' && (
            <label>
              {t('inspector.task.responseMode')}
              <select disabled={disabled} onChange={(event) => setLlmMode(event.target.value as 'chat' | 'json')} value={llmMode}>
                <option value="chat">{t('inspector.task.chatText')}</option>
                <option value="json">{t('inspector.task.structuredJson')}</option>
              </select>
            </label>
          )}
          {'executor' in task && task.executor.kind == 'connector' && (
            <div className="field-group">
              <span>{t('inspector.task.connectorAction')}</span>
              <p className="reference-value">{connectorAction?.name ?? task.executor.action}</p>
            </div>
          )}
          <label>
            {t('inspector.task.inputPorts')}
            <textarea disabled={disabled} onChange={(event) => setInputs(event.target.value)} rows={7} spellCheck={false} value={inputs} />
          </label>
          <label>
            {t('inspector.task.outputPorts')}
            <textarea disabled={disabled} onChange={(event) => setOutputs(event.target.value)} rows={7} spellCheck={false} value={outputs} />
          </label>
          {definitionError != null && <p className="form-error">{definitionError}</p>}
          <div className="form-actions">
            <button className="button secondary small" disabled={disabled || name.trim() == ''} type="submit">
              {t('inspector.task.save')}
            </button>
          </div>
        </form>
      </details>
    </>
  )
}

function ConditionDefinition({
  disabled,
  node,
  nodeId,
  store,
}: {
  readonly disabled: boolean
  readonly node: ConditionNode
  readonly nodeId: string
  readonly store: WorkspaceStore
}): ReactElement {
  const t = useTranslate()
  const [inputHandle, setInputHandle] = useState(node.input.handle)
  const [nullable, setNullable] = useState(node.input.nullable)
  const [schema, setSchema] = useState(json(node.input.jsonSchema))
  const [cases, setCases] = useState(json(node.cases))
  const [defaultOutput, setDefaultOutput] = useState(node.defaultOutput ?? '')
  const [error, setError] = useState<string>()

  useEffect(() => {
    setInputHandle(node.input.handle)
    setNullable(node.input.nullable)
    setSchema(json(node.input.jsonSchema))
    setCases(json(node.cases))
    setDefaultOutput(node.defaultOutput ?? '')
    setError(undefined)
  }, [node])

  return (
    <form
      className="inspector-section inspector-form"
      data-inspector-section="condition"
      onSubmit={(event) => {
        event.preventDefault()
        try {
          const parsedCases = JSON.parse(cases) as unknown
          if (!Array.isArray(parsedCases)) throw new TypeError(t('inspector.condition.casesObjectError'))
          setError(undefined)
          void store.saveCondition(nodeId, {
            cases: parsedCases as ConditionSettings['cases'],
            ...(defaultOutput.trim() == '' ? {} : { defaultOutput: defaultOutput.trim() }),
            input: {
              ...node.input,
              handle: inputHandle.trim(),
              jsonSchema: JSON.parse(schema) as JsonValue,
              nullable,
            },
          })
        } catch (parseError) {
          setError(parseError instanceof TypeError ? parseError.message : t('inspector.condition.invalid'))
        }
      }}
    >
      <h3>{t('inspector.condition.title')}</h3>
      <div className="field-pair">
        <label>
          {t('inspector.condition.inputHandle')}
          <input disabled={disabled} onChange={(event) => setInputHandle(event.target.value)} value={inputHandle} />
        </label>
        <label>
          {t('inspector.condition.defaultOutput')}
          <input disabled={disabled} onChange={(event) => setDefaultOutput(event.target.value)} placeholder={t('common.none')} value={defaultOutput} />
        </label>
      </div>
      <label className="checkbox-field">
        <input checked={nullable} disabled={disabled} onChange={(event) => setNullable(event.target.checked)} type="checkbox" />
        {t('inspector.condition.acceptNull')}
      </label>
      <label>
        {t('inspector.condition.inputSchema')}
        <textarea disabled={disabled} onChange={(event) => setSchema(event.target.value)} rows={5} spellCheck={false} value={schema} />
      </label>
      <label>
        {t('inspector.condition.cases')}
        <textarea disabled={disabled} onChange={(event) => setCases(event.target.value)} rows={12} spellCheck={false} value={cases} />
      </label>
      {error != null && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="button secondary small" disabled={disabled || inputHandle.trim() == ''} type="submit">
          {t('inspector.condition.save')}
        </button>
      </div>
    </form>
  )
}

function SubflowDefinition({
  definition,
  disabled,
  store,
  subflowId,
}: {
  readonly definition: NonNullable<ReturnType<RevisionView['subflow']>>
  readonly disabled: boolean
  readonly store: WorkspaceStore
  readonly subflowId: string
}): ReactElement {
  const t = useTranslate()
  const [name, setName] = useState(definition.name)
  const [inputs, setInputs] = useState(json(definition.inputs))
  const [outputs, setOutputs] = useState(json(definition.outputs))
  const [error, setError] = useState<string>()

  useEffect(() => {
    setName(definition.name)
    setInputs(json(definition.inputs))
    setOutputs(json(definition.outputs))
    setError(undefined)
  }, [definition])

  return (
    <form
      className="inspector-section inspector-form"
      onSubmit={(event) => {
        event.preventDefault()
        try {
          const nextInputs = objectValue(inputs, t('inspector.subflow.inputPorts'), t)
          const nextOutputs = objectValue(outputs, t('inspector.subflow.outputPorts'), t)
          setError(undefined)
          void store.saveSubflowSettings(subflowId, { inputs: nextInputs, name: name.trim(), outputs: nextOutputs })
        } catch (parseError) {
          setError(parseError instanceof TypeError ? parseError.message : t('inspector.errors.portDefinitions'))
        }
      }}
    >
      <h3>{t('inspector.subflow.definition')}</h3>
      <label>
        {t('common.name')}
        <input disabled={disabled} onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      <label>
        {t('inspector.subflow.inputPorts')}
        <textarea disabled={disabled} onChange={(event) => setInputs(event.target.value)} rows={8} spellCheck={false} value={inputs} />
      </label>
      <label>
        {t('inspector.subflow.outputPorts')}
        <textarea disabled={disabled} onChange={(event) => setOutputs(event.target.value)} rows={10} spellCheck={false} value={outputs} />
      </label>
      {error != null && <p className="form-error">{error}</p>}
      <div className="form-actions">
        <button className="button secondary small" disabled={disabled || name.trim() == ''} type="submit">
          {t('inspector.subflow.save')}
        </button>
      </div>
    </form>
  )
}

function TriggerDefinition({
  activeConnections,
  authorizationPending,
  connection,
  connectionError,
  connectionLoading,
  disabled,
  selection,
  triggers,
}: {
  readonly activeConnections?: readonly ConnectorConnection[]
  readonly authorizationPending: boolean
  readonly connection?: ConnectorConnection
  readonly connectionError?: string
  readonly connectionLoading: boolean
  readonly disabled: boolean
  readonly selection: Extract<ResolvedSelection, { readonly kind: 'trigger' }>
  readonly triggers: TriggerStore
}): ReactElement {
  const t = useTranslate()
  const trigger = selection.trigger
  const [name, setName] = useState(trigger.name)
  const [description, setDescription] = useState(trigger.description ?? '')
  const providerTrigger = trigger.kind == 'poll' || trigger.kind == 'integration' ? trigger : undefined

  useEffect(() => {
    setName(trigger.name)
    setDescription(trigger.description ?? '')
  }, [trigger])

  const connectionSection =
    providerTrigger == null ? null : (
      <section className={`inspector-section connection-state ${connection?.status == 'active' ? '' : 'required'}`} data-inspector-section="account">
        <h3>
          <Icon name="connection" size={15} /> {t('inspector.account.title')}
        </h3>
        {authorizationPending && <p>{t('inspector.account.authorizationPending')}</p>}
        {connectionLoading ? (
          <p>{t('inspector.account.loading')}</p>
        ) : connectionError != null ? (
          <>
            <p>{t('inspector.account.refreshFailed')}</p>
            <p className="connection-detail">{connectionError}</p>
            <button className="button secondary small" disabled={disabled} onClick={() => void triggers.refresh(true)} type="button">
              {t('inspector.account.retry')}
            </button>
          </>
        ) : (activeConnections?.length ?? 0) == 0 ? (
          <>
            <p>{t('inspector.account.connectBeforeRun', { service: providerTrigger.definition.provider })}</p>
            <button
              className="button primary small"
              disabled={disabled}
              onClick={() => void triggers.connect(providerTrigger.definition.provider)}
              type="button"
            >
              {t('inspector.account.connectService', { service: providerTrigger.definition.provider })}
            </button>
          </>
        ) : (
          <>
            <div className="connection-field">
              <span>{t('inspector.account.connection')}</span>
              <div className="select-wrap">
                <select
                  aria-label={t('inspector.account.connection')}
                  disabled={disabled}
                  onChange={(event) => void triggers.setConnection(selection.id, event.target.value)}
                  value={connection?.connectionId ?? ''}
                >
                  {connection == null && (
                    <option disabled value="">
                      {t('inspector.account.chooseAccount')}
                    </option>
                  )}
                  {activeConnections!.map((candidate) => (
                    <option key={candidate.connectionId} value={candidate.connectionId}>
                      {candidate.displayName}
                      {candidate.isDefault ? ` (${t('inspector.account.teamDefault')})` : ''}
                    </option>
                  ))}
                </select>
                <Icon name="chevron-down" size={15} />
              </div>
            </div>
            <button
              className="button secondary small"
              disabled={disabled}
              onClick={() => void triggers.connect(providerTrigger.definition.provider)}
              type="button"
            >
              <Icon name="plus" size={14} /> {t('inspector.account.addConnection')}
            </button>
          </>
        )}
      </section>
    )

  return (
    <>
      {connectionSection}
      <form
        className="inspector-section inspector-form"
        data-inspector-section="trigger"
        onSubmit={(event) => {
          event.preventDefault()
          const common = { ...(description.trim() == '' ? {} : { description: description.trim() }), name: name.trim() }
          let settings: TriggerSettings
          switch (trigger.kind) {
            case 'webhook':
              settings = { ...common, inputs: trigger.inputsDef, kind: trigger.kind, options: trigger.options ?? {} }
              break
            case 'cron': {
              settings = {
                ...common,
                kind: trigger.kind,
                schedule: trigger.cronTimes,
              }
              break
            }
            case 'poll': {
              settings = {
                ...common,
                config: trigger.config,
                kind: trigger.kind,
                schedule: trigger.pollTimes,
              }
              break
            }
            case 'integration':
              settings = { ...common, config: trigger.config, kind: trigger.kind }
              break
          }
          void triggers.saveSettings(selection.id, settings)
        }}
      >
        <h3>{t('inspector.trigger.title')}</h3>
        <label>
          {t('common.name')}
          <input disabled={disabled} onChange={(event) => setName(event.target.value)} value={name} />
        </label>
        <label>
          {t('inspector.trigger.description')}
          <input disabled={disabled} onChange={(event) => setDescription(event.target.value)} value={description} />
        </label>
        <div className="form-actions">
          <button className="button secondary small" disabled={disabled || name.trim() == ''} type="submit">
            {t('inspector.trigger.save')}
          </button>
        </div>
      </form>
    </>
  )
}

interface Props {
  readonly connectorAction?: ConnectorAction
  readonly connectorActionError?: string
  readonly connectorAuthorizationPending: boolean
  readonly connectorConnection?: ConnectorConnection
  readonly connectorConnectionError?: string
  readonly activeConnectorConnections?: readonly ConnectorConnection[]
  readonly connectors: ConnectorStore
  readonly connectorLoading: boolean
  readonly diagnostics: readonly Diagnostic[]
  readonly disabled: boolean
  readonly focus?: DiagnosticFocus
  readonly revision: RevisionView
  readonly selection: ResolvedSelection | undefined
  readonly store: WorkspaceStore
  readonly target: DesignerTarget
  readonly triggerActiveConnections?: readonly ConnectorConnection[]
  readonly triggerAuthorizationPending: boolean
  readonly triggerConnection?: ConnectorConnection
  readonly triggerConnectionError?: string
  readonly triggerConnectionLoading: boolean
  readonly triggers: TriggerStore
}

export function NodeInspector({
  connectorAction,
  connectorActionError,
  connectorAuthorizationPending,
  connectorConnection,
  connectorConnectionError,
  activeConnectorConnections,
  connectors,
  connectorLoading,
  diagnostics,
  disabled,
  focus,
  revision,
  selection,
  store,
  target,
  triggerActiveConnections,
  triggerAuthorizationPending,
  triggerConnection,
  triggerConnectionError,
  triggerConnectionLoading,
  triggers,
}: Props): ReactElement {
  const t = useTranslate()
  const content = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (focus == null) return
    const section = content.current?.querySelector<HTMLElement>(`[data-inspector-section="${focus.section}"]`)
    if (section == null) return
    if (section instanceof HTMLDetailsElement) section.open = true
    section.scrollIntoView({ block: 'nearest' })
    section.classList.remove('diagnostic-located')
    void section.offsetWidth
    section.classList.add('diagnostic-located')
    const timer = globalThis.setTimeout(() => section.classList.remove('diagnostic-located'), 1_200)
    return () => globalThis.clearTimeout(timer)
  }, [focus])

  return (
    <div className="inspector-content" ref={content}>
      <Diagnostics diagnostics={diagnostics} />
      {selection == null ? (
        target.kind == 'subflow' ? (
          <SubflowDefinition definition={revision.subflow(target.id)!} disabled={disabled} store={store} subflowId={target.id} />
        ) : (
          <div className="inspector-empty">{t('inspector.selectNode')}</div>
        )
      ) : (
        <>
          {selection.kind == 'trigger' ? (
            <TriggerDefinition
              activeConnections={triggerActiveConnections}
              authorizationPending={triggerAuthorizationPending}
              connection={triggerConnection}
              connectionError={triggerConnectionError}
              connectionLoading={triggerConnectionLoading}
              disabled={disabled}
              selection={selection}
              triggers={triggers}
            />
          ) : selection.kind == 'task' ? (
            <TaskDefinition
              connectorAction={connectorAction}
              connectorActionError={connectorActionError}
              connectorAuthorizationPending={connectorAuthorizationPending}
              connectorConnection={connectorConnection}
              connectorConnectionError={connectorConnectionError}
              activeConnectorConnections={activeConnectorConnections}
              connectors={connectors}
              connectorLoading={connectorLoading}
              disabled={disabled}
              focus={focus}
              selection={selection}
              store={store}
            >
              <GeneralSettings disabled={disabled} node={selection.node} nodeId={selection.id} store={store} />
            </TaskDefinition>
          ) : (
            <GeneralSettings disabled={disabled} node={selection.node} nodeId={selection.id} store={store} />
          )}
          {selection.kind == 'condition' && <ConditionDefinition disabled={disabled} node={selection.node} nodeId={selection.id} store={store} />}
          {selection.kind == 'subflow' && (
            <section className="inspector-section">
              <h3>{t('inspector.subflow.referenced')}</h3>
              <p className="reference-value">{selection.definition?.name ?? selection.node.subflowId}</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
