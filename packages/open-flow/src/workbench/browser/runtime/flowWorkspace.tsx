import type { ReactElement } from 'react'
import type { FlowDesignerViewInput, FlowDesignerViewOutput } from '../../../designer/browser/graph/FlowDesigner/FlowDesignerView.tsx'
import type { JsonValue } from './api.ts'
import type { WorkbenchLanguage } from './contract.ts'
import type { AddNodeOption } from './designer/addNodeOptions.ts'
import type { CodeTaskPorts } from './designer/projectChanges.ts'
import type { WorkbenchDesignerHandle } from './designer/workbenchDesigner.tsx'

import { useEffect, useRef, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { IconifyProvider } from '../../../designer/browser/icons/iconifyContext.tsx'
import { BlockLibrary, ContextPanel } from './designer/contextPanel.tsx'
import { inspectorIcon, NodeInspector } from './designer/nodeInspector.tsx'
import { WorkbenchDesigner } from './designer/workbenchDesigner.tsx'
import { NavigationStore } from './navigation.ts'
import { PublicationsView } from './publications/publicationsView.tsx'
import { RunDrawer } from './runs/runDrawer.tsx'
import { RunInputPanel } from './runs/runInputPanel.tsx'
import { RunsView } from './runs/runsView.tsx'
import { WorkspaceHeader } from './shell/workspaceHeader.tsx'
import { WorkbenchStore } from './stores/workbenchStore.ts'

type ContextPanelMode = 'blocks' | 'inspector' | undefined

function codeTaskPorts(inputs: readonly FlowDesignerViewInput[], outputs: readonly FlowDesignerViewOutput[]): CodeTaskPorts {
  return {
    inputs: Object.fromEntries(
      inputs.map((input) => [
        input.handle,
        Object.assign(
          {
            ...(input.description == null ? {} : { description: input.description }),
            jsonSchema: (input.jsonSchema ?? {}) as JsonValue,
            nullable: input.nullable ?? false,
          },
          input.defaultValue === undefined ? {} : { value: input.defaultValue as JsonValue },
        ),
      ]),
    ),
    outputs: Object.fromEntries(
      outputs.map((output) => [
        output.handle,
        {
          ...(output.description == null ? {} : { description: output.description }),
          jsonSchema: (output.jsonSchema ?? {}) as JsonValue,
          nullable: output.nullable ?? false,
        },
      ]),
    ),
  }
}

function RunDrawerContainer({
  onClose,
  onToggle,
  open,
  store,
  visible,
}: {
  readonly onClose: () => void
  readonly onToggle: () => void
  readonly open: boolean
  readonly store: WorkbenchStore
  readonly visible: boolean
}): ReactElement | null {
  const cancelingRunId = useVal(store.runs.$.cancelingRunId)
  const eventFilter = useVal(store.runs.$.eventFilter)
  const events = useVal(store.runs.$.events)
  const eventsExpiresAt = useVal(store.runs.$.eventsExpiresAt)
  const eventNodes = useVal(store.$.runEventNodes)
  const historyComplete = useVal(store.runs.$.historyComplete)
  const observationFailed = useVal(store.runs.$.observationFailed)
  const result = useVal(store.runs.$.result)
  const run = useVal(store.runs.$.run)
  const submitting = useVal(store.runRequests.$.submitting)
  return (
    <RunDrawer
      cancelDisabled={cancelingRunId != null}
      canceling={cancelingRunId == run?.runId}
      eventFilter={eventFilter}
      eventNodes={eventNodes}
      events={events}
      eventsExpiresAt={eventsExpiresAt}
      historyComplete={historyComplete}
      onCancel={() => void store.runs.cancel()}
      onClose={onClose}
      onEventFilterChange={(filter) => store.runs.setEventFilter(filter)}
      onLocateEvent={(sequence) => store.locateRunEvent(sequence)}
      onRetryObservation={() => store.runs.retryObservation()}
      onToggle={onToggle}
      observationFailed={observationFailed}
      open={open}
      result={result}
      run={run}
      submitting={submitting != null}
      visible={visible}
    />
  )
}

function Editor({
  onCloseRuns,
  onToggleRuns,
  runDrawerOpen,
  runDrawerVisible,
  store,
}: {
  readonly onCloseRuns: () => void
  readonly onToggleRuns: () => void
  readonly runDrawerOpen: boolean
  readonly runDrawerVisible: boolean
  readonly store: WorkbenchStore
}): ReactElement {
  const t = useTranslate()
  const addNodeOptions = useVal(store.workspace.$.addNodeOptions)
  const busy = useVal(store.$.busy)
  const designer = useVal(store.$.designer)
  const diagnosticFocus = useVal(store.workspace.$.diagnosticFocus)
  const draft = useVal(store.workspace.$.draft)
  const inspectorDiagnostics = useVal(store.workspace.$.inspectorDiagnostics)
  const nodeFocus = useVal(store.workspace.$.nodeFocus)
  const projectId = useVal(store.workspace.$.projectId)
  const revision = useVal(store.workspace.$.revision)
  const selectedDesignerNode = useVal(store.$.selectedDesignerNode)
  const selection = useVal(store.workspace.$.selection)
  const selectedNodeIds = useVal(store.workspace.$.selectedNodeIds)
  const target = useVal(store.workspace.$.target)
  const targetName = useVal(store.workspace.$.targetName)
  const connectorAction = useVal(store.connectors.$.selectedAction)
  const connectorActionError = useVal(store.connectors.$.selectedActionError)
  const connectorActionLoading = useVal(store.connectors.$.actionLoading)
  const connectorAuthorizationPending = useVal(store.connectors.$.selectedAuthorizationPending)
  const connectorConnection = useVal(store.connectors.$.selectedConnection)
  const connectorConnectionError = useVal(store.connectors.$.selectedConnectionError)
  const connectorConnectionLoading = useVal(store.connectors.$.connectionLoading)
  const activeConnectorConnections = useVal(store.connectors.$.selectedActiveConnections)
  const triggerAuthorizationPending = useVal(store.triggers.$.selectedAuthorizationPending)
  const triggerConnection = useVal(store.triggers.$.selectedConnection)
  const triggerConnectionError = useVal(store.triggers.$.selectedConnectionError)
  const triggerConnectionLoading = useVal(store.triggers.$.connectionLoading)
  const triggerActiveConnections = useVal(store.triggers.$.selectedActiveConnections)
  const [contextPanelMode, setContextPanelMode] = useState<ContextPanelMode>()
  const [blocksFocusRequest, setBlocksFocusRequest] = useState(0)
  const addingFromBlocks = useRef(false)
  const blockAddCount = useRef(0)
  const designerRef = useRef<WorkbenchDesignerHandle>(null)
  const focusInspectorOnOpen = useRef(false)
  const opener = useRef<HTMLElement>()

  useEffect(() => {
    addingFromBlocks.current = false
    blockAddCount.current = 0
    focusInspectorOnOpen.current = false
    opener.current = undefined
    setContextPanelMode(undefined)
  }, [projectId, target?.id, target?.kind])

  useEffect(() => {
    if (diagnosticFocus == null) return
    focusInspectorOnOpen.current = false
    opener.current = undefined
    setContextPanelMode('inspector')
  }, [diagnosticFocus])

  const authoringDisabled = draft == null || (busy != null && busy != 'designer')
  const closeContextPanel = (focusTarget = opener.current): void => {
    setContextPanelMode(undefined)
    focusInspectorOnOpen.current = false
    opener.current = undefined
    globalThis.setTimeout(() => {
      if (focusTarget?.isConnected) focusTarget.focus({ preventScroll: true })
      else designerRef.current?.focusCanvas()
    }, 0)
  }
  const openBlocks = (button?: HTMLButtonElement): void => {
    opener.current = button
    focusInspectorOnOpen.current = false
    setContextPanelMode('blocks')
    setBlocksFocusRequest((request) => request + 1)
  }
  const openInspector = (): void => {
    if (addingFromBlocks.current) {
      addingFromBlocks.current = false
      return
    }
    opener.current = undefined
    focusInspectorOnOpen.current = false
    setContextPanelMode('inspector')
  }
  const toggleInspector = (button: HTMLButtonElement): void => {
    if (contextPanelMode == 'inspector') {
      closeContextPanel(button)
      return
    }
    opener.current = button
    focusInspectorOnOpen.current = true
    setContextPanelMode('inspector')
  }
  const addFromBlocks = async (option: AddNodeOption): Promise<string | undefined> => {
    const offset = blockAddCount.current * 32
    const position = {
      x: (92 + offset - designer.viewport.x) / designer.viewport.zoom,
      y: (92 + offset - designer.viewport.y) / designer.viewport.zoom,
    }
    addingFromBlocks.current = true
    let waitForSelection = false
    try {
      const nodeId = await store.addNode(option, position)
      if (nodeId != null) {
        waitForSelection = true
        blockAddCount.current++
        setContextPanelMode(option.kind == 'connector' || option.kind == 'trigger' ? 'inspector' : 'blocks')
      }
      return nodeId
    } finally {
      if (!waitForSelection) addingFromBlocks.current = false
    }
  }

  const contextPanelVisible = contextPanelMode != null && target != null && (contextPanelMode == 'blocks' || revision != null)

  return (
    <div
      aria-labelledby="workspace-tab-design"
      className={`editor-grid ${contextPanelVisible ? '' : 'context-panel-closed'}`}
      id="workspace-panel-design"
      role="tabpanel"
      tabIndex={0}
    >
      <WorkbenchDesigner
        addNodeOptions={addNodeOptions}
        blocksOpen={contextPanelMode == 'blocks'}
        disabled={authoringDisabled}
        focusNodeRequest={diagnosticFocus ?? nodeFocus}
        inspectorOpen={contextPanelMode == 'inspector'}
        model={designer}
        onAddNode={async (option, position, connection) => {
          const nodeId = await store.addNode(option, position, connection)
          return nodeId
        }}
        onConnect={(edge) => void store.workspace.connect(edge)}
        onChangeComment={(nodeId, value) => void store.workspace.saveComment(nodeId, value)}
        onChangeNodeDescription={(nodeId, description) => void store.workspace.saveNodeDescription(nodeId, description)}
        onChangeInput={(nodeId, handle, value) => void store.workspace.setInputValue(nodeId, handle, value)}
        onChangeTaskPorts={(nodeId, inputs, outputs) => void store.workspace.saveCodeTaskPorts(nodeId, codeTaskPorts(inputs, outputs))}
        onChangeTriggerConfig={(triggerId, name, value) => void store.workspace.saveTriggerConfig(triggerId, name, value)}
        onChangeTriggerSchedule={(triggerId, schedule) => void store.workspace.saveTriggerSchedule(triggerId, schedule)}
        onChangeWebhook={(triggerId, webhook) => void store.workspace.saveWebhook(triggerId, webhook)}
        onChangeValue={(nodeId, values) => void store.workspace.saveValue(nodeId, values)}
        onCopy={() => store.workspace.copySelectedNodes()}
        onDeleteEdge={(edge) => void store.workspace.disconnect(edge)}
        onDeleteNodes={() => void store.workspace.deleteSelectedNodes()}
        onDuplicate={() => void store.workspace.duplicateSelectedNodes()}
        onMoveNodes={(positions) => void store.workspace.moveNodes(positions)}
        onMoveViewport={(viewport) => void store.workspace.moveViewport(viewport)}
        onOpenBlocks={openBlocks}
        onOpenInspector={openInspector}
        onPaste={() => void store.workspace.pasteNodes()}
        provideAddNodeOptions={store.provideAddNodeOptions}
        onSelectNodes={(nodeIds) => store.selectNodes(nodeIds)}
        onToggleInspector={toggleInspector}
        ref={designerRef}
        selectedNodeIds={selectedNodeIds}
        target={target}
      />
      {contextPanelVisible && (
        <ContextPanel
          focusOnOpen={contextPanelMode == 'inspector' && focusInspectorOnOpen.current}
          icon={contextPanelMode == 'blocks' ? 'plus' : inspectorIcon(selection, target)}
          onClose={() => closeContextPanel()}
          title={contextPanelMode == 'blocks' ? t('contextPanel.blocks') : (selectedDesignerNode?.title ?? targetName ?? t('inspector.title'))}
        >
          {contextPanelMode == 'blocks' ? (
            <BlockLibrary
              browseOptions={store.browseAddNodeOptions}
              disabled={authoringDisabled}
              focusRequest={blocksFocusRequest}
              onAdd={addFromBlocks}
              onRegisterDragOption={(option) => designerRef.current?.registerAddNodeOption(option)}
              options={addNodeOptions}
              provideChoices={store.provideAddNodeOptionChoices}
            />
          ) : (
            revision != null && (
              <NodeInspector
                connectorAction={connectorAction}
                connectorActionError={connectorActionError}
                connectorAuthorizationPending={connectorAuthorizationPending}
                connectorConnection={connectorConnection}
                connectorConnectionError={connectorConnectionError}
                activeConnectorConnections={activeConnectorConnections}
                connectors={store.connectors}
                connectorLoading={connectorActionLoading != null || connectorConnectionLoading != null}
                diagnostics={inspectorDiagnostics}
                focus={diagnosticFocus}
                disabled={authoringDisabled}
                revision={revision}
                selection={selection}
                store={store.workspace}
                target={target}
                triggerActiveConnections={triggerActiveConnections}
                triggerAuthorizationPending={triggerAuthorizationPending}
                triggerConnection={triggerConnection}
                triggerConnectionError={triggerConnectionError}
                triggerConnectionLoading={triggerConnectionLoading != null}
                triggers={store.triggers}
              />
            )
          )}
        </ContextPanel>
      )}
      <RunDrawerContainer onClose={onCloseRuns} onToggle={onToggleRuns} open={runDrawerOpen} store={store} visible={runDrawerVisible} />
    </div>
  )
}

export default function FlowWorkspace({
  language,
  navigation,
  onLanguageChange,
  store,
}: {
  readonly language: WorkbenchLanguage
  readonly navigation: NavigationStore
  readonly onLanguageChange?: ((language: WorkbenchLanguage) => void) | undefined
  readonly store: WorkbenchStore
}): ReactElement {
  const [runDrawerVisible, setRunDrawerVisible] = useState(false)
  const [runDrawerOpen, setRunDrawerOpen] = useState(true)
  const handledExternalRun = useRef<string>()
  const view = useVal(navigation.$.view)
  const draft = useVal(store.workspace.$.draft)
  const projectId = useVal(store.workspace.$.projectId)
  const submitting = useVal(store.runRequests.$.submitting)
  const externalRunId = useVal(store.runs.$.externalRunId)
  const target = useVal(store.workspace.$.target)
  const flowId = target?.kind == 'flow' ? target.id : undefined
  const draftReady = draft != null

  useEffect(() => {
    if (view == 'runs' && projectId != null) void store.runs.load(projectId, flowId)
  }, [flowId, projectId, store, view])

  useEffect(() => {
    if (view == 'publications' && projectId != null && flowId != null) void store.publications.load(projectId, flowId)
  }, [flowId, projectId, store, view])

  useEffect(() => store.runRequests.dismissInputs(), [draft?.revisionId, flowId, projectId, store])

  useEffect(() => {
    if (submitting == null || !draftReady) return
    navigation.open('design')
    setRunDrawerVisible(true)
    setRunDrawerOpen(true)
  }, [draftReady, navigation, submitting])

  useEffect(() => {
    if (externalRunId == null || handledExternalRun.current == externalRunId) return
    handledExternalRun.current = externalRunId
    if (view != 'design') return
    setRunDrawerVisible(true)
    setRunDrawerOpen(true)
  }, [externalRunId, view])

  const revealRun = (): void => {
    if (store.workspace.$.targetFlow.value?.draft == null) {
      navigation.open('runs')
    } else {
      navigation.open('design')
      setRunDrawerVisible(true)
      setRunDrawerOpen(true)
    }
  }
  const runDraft = async (): Promise<void> => {
    navigation.open('design')
    if ((await store.requestDraftRun()) == 'started') revealRun()
  }
  const runLive = async (): Promise<void> => {
    if ((await store.requestLiveRun()) == 'started') revealRun()
  }
  const locateRunEvent = (sequence: number): void => {
    if (store.locateRunEvent(sequence)) revealRun()
  }

  return (
    <IconifyProvider>
      <main className="workspace">
        <WorkspaceHeader
          activeView={view}
          language={language}
          onOpenDesign={() => navigation.open('design')}
          onOpenProject={() => navigation.openProject()}
          onOpenProjects={() => void navigation.openProjects()}
          onOpenPublications={() => {
            store.runRequests.dismissInputs()
            navigation.open('publications')
          }}
          onOpenRuns={() => {
            store.runRequests.dismissInputs()
            navigation.open('runs')
          }}
          onRunDraft={() => void runDraft()}
          onRunLive={() => void runLive()}
          onLanguageChange={onLanguageChange}
          store={store}
        />
        <RunInputPanel onStarted={revealRun} store={store.runRequests} />
        {view == 'design' ? (
          <Editor
            onCloseRuns={() => setRunDrawerVisible(false)}
            onToggleRuns={() => setRunDrawerOpen(!runDrawerOpen)}
            runDrawerOpen={runDrawerOpen}
            runDrawerVisible={runDrawerVisible}
            store={store}
          />
        ) : view == 'runs' ? (
          <RunsView onLocateEvent={locateRunEvent} store={store} />
        ) : (
          <PublicationsView store={store} />
        )}
      </main>
    </IconifyProvider>
  )
}
