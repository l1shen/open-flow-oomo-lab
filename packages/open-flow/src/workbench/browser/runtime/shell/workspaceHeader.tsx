import type { ReactElement } from 'react'
import type { TFunction } from 'val-i18n'
import type { Flow } from '../api.ts'
import type { WorkbenchLanguage } from '../contract.ts'
import type { WorkbenchStore } from '../stores/workbenchStore.ts'
import type { WorkspaceStatus } from '../stores/workspaceModel.ts'

import { useEffect, useRef, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { Button } from '../../../../ui/browser/button.tsx'
import { Tabs, TabsList, TabsTrigger } from '../../../../ui/browser/tabs.tsx'
import { Icon } from '../icons.tsx'
import { followWorkbenchLink } from '../navigationLink.ts'
import { DiagnosticsPanel } from './diagnosticsPanel.tsx'
import { LanguageSelect } from './resourceBrowser.tsx'

const savingStatusDelayMs = 400
const minimumSavingStatusMs = 400

interface Props {
  readonly activeView: 'design' | 'publications' | 'runs'
  readonly language: WorkbenchLanguage
  readonly onOpenDesign: () => void
  readonly onOpenProject: () => void
  readonly onOpenProjects: () => void
  readonly onOpenPublications: () => void
  readonly onOpenRuns: () => void
  readonly onRunDraft: () => void
  readonly onRunLive: () => void
  readonly projectHref: string
  readonly projectsHref: string
  readonly onLanguageChange?: ((language: WorkbenchLanguage) => void) | undefined
  readonly store: WorkbenchStore
}

function flowRevisionLabel(flow: Flow, t: TFunction): string {
  if (flow.draft == null) return t('workspace.liveOnly')
  return t(flow.live == null ? 'workspace.draft' : 'workspace.liveAndDraft')
}

function validationLabel(valid: boolean | undefined, issueCount: number, loading: boolean, t: TFunction): string {
  if (loading) return t('workspace.checking')
  if (valid == null) return t('workspace.notChecked')
  if (valid) return t('workspace.valid')
  return issueCount == 1 ? t('workspace.issueSingle') : t('workspace.issues', { count: issueCount })
}

function useDisplayedStatus(status: WorkspaceStatus): WorkspaceStatus {
  const [displayed, setDisplayed] = useState(status)
  const savingStarted = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (status == 'saving') {
      if (displayed == 'saving') return
      const timer = setTimeout(() => {
        savingStarted.current = Date.now()
        setDisplayed('saving')
      }, savingStatusDelayMs)
      return () => clearTimeout(timer)
    }
    if (displayed != 'saving' || status != 'saved' || savingStarted.current == null) {
      savingStarted.current = undefined
      setDisplayed(status)
      return
    }
    const remaining = minimumSavingStatusMs - (Date.now() - savingStarted.current)
    if (remaining <= 0) {
      savingStarted.current = undefined
      setDisplayed('saved')
      return
    }
    const timer = setTimeout(() => {
      savingStarted.current = undefined
      setDisplayed('saved')
    }, remaining)
    return () => clearTimeout(timer)
  }, [displayed, status])

  return displayed
}

export function WorkspaceHeader({
  activeView,
  language,
  onLanguageChange,
  onOpenDesign,
  onOpenProject,
  onOpenProjects,
  onOpenPublications,
  onOpenRuns,
  onRunDraft,
  onRunLive,
  projectHref,
  projectsHref,
  store,
}: Props): ReactElement {
  const t = useTranslate()
  const busy = useVal(store.$.busy)
  const checkLoading = useVal(store.workspace.$.checkLoading)
  const diagnostics = useVal(store.workspace.$.diagnostics)
  const diagnosticItems = useVal(store.workspace.$.diagnosticItems)
  const draft = useVal(store.workspace.$.draft)
  const project = useVal(store.workspace.$.project)
  const status = useVal(store.workspace.$.status)
  const displayedStatus = useDisplayedStatus(status)
  const runInputRequest = useVal(store.runRequests.$.inputRequest)
  const target = useVal(store.workspace.$.target)
  const targetFlow = useVal(store.workspace.$.targetFlow)
  const targetName = useVal(store.workspace.$.targetName)
  const workspaceLoading = useVal(store.workspace.$.workspaceLoading)
  const diagnosticsButton = useRef<HTMLButtonElement>(null)
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false)
  const invalid = diagnostics?.valid == false
  const draftRunUnavailable = invalid ? t('workspace.fixIssuesToRun') : target?.kind == 'subflow' ? t('workspace.openFlowToRun') : undefined
  const liveRunUnavailable = targetFlow?.live?.status == 'suspended' ? t('workspace.liveSuspended') : undefined
  const publishUnavailable = invalid ? t('workspace.fixIssuesToPublish') : target?.kind == 'subflow' ? t('workspace.subflowPublishHelp') : undefined

  useEffect(() => {
    if (runInputRequest != null) setDiagnosticsOpen(false)
  }, [runInputRequest])

  const openView = (view: string | null): void => {
    if (view == 'design') onOpenDesign()
    else if (view == 'runs') onOpenRuns()
    else if (view == 'publications') onOpenPublications()
  }

  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <Button
          className="min-w-0 max-w-35 truncate"
          nativeButton={false}
          onClick={(event) => followWorkbenchLink(event, onOpenProjects)}
          render={<a href={projectsHref} />}
          size="sm"
          variant="link"
        >
          {t('resource.workflows')}
        </Button>
        <span>/</span>
        <Button
          className="min-w-0 max-w-35 truncate"
          nativeButton={false}
          onClick={(event) => followWorkbenchLink(event, onOpenProject)}
          render={<a href={projectHref} />}
          size="sm"
          variant="link"
        >
          {project?.name ?? project?.projectId ?? t('resource.projects')}
        </Button>
        <span>/</span>
        <strong>{targetName ?? t('workspace.workbench')}</strong>
        {target?.kind == 'subflow' && <span>{t('workspace.subflowDraft')}</span>}
        {targetFlow != null && <span>{flowRevisionLabel(targetFlow, t)}</span>}
        {targetFlow?.hasUnpublishedChanges && (
          <span className="draft-change">
            <span className="status-dot neutral" /> {t('workspace.unpublishedChanges')}
          </span>
        )}
      </div>
      <Tabs className="workspace-tabs-root" onValueChange={openView} value={activeView}>
        <TabsList aria-label={t('workspace.views')} className="workspace-tabs">
          <TabsTrigger
            aria-controls="workspace-panel-design"
            disabled={targetFlow != null && targetFlow.draft == null}
            id="workspace-tab-design"
            value="design"
          >
            {t('workspace.design')}
          </TabsTrigger>
          <TabsTrigger aria-controls="workspace-panel-runs" id="workspace-tab-runs" value="runs">
            {t('workspace.runs')}
          </TabsTrigger>
          <TabsTrigger aria-controls="workspace-panel-publications" disabled={targetFlow == null} id="workspace-tab-publications" value="publications">
            {t('workspace.publications')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="workspace-actions">
        <LanguageSelect language={language} onLanguageChange={onLanguageChange} />
        <Button
          aria-controls="diagnostics-panel"
          aria-expanded={diagnosticsOpen}
          className="validation-state"
          disabled={target == null || (target.kind == 'flow' && targetFlow?.draft == null) || checkLoading}
          onClick={() => {
            store.runRequests.dismissInputs()
            setDiagnosticsOpen(!diagnosticsOpen)
          }}
          ref={diagnosticsButton}
          title={t('diagnostics.open')}
          variant={invalid ? 'destructive' : 'ghost'}
        >
          <Icon data-icon="inline-start" name={diagnostics?.valid == false ? 'alert' : 'check'} />
          {validationLabel(diagnostics?.valid, diagnostics?.diagnostics.length ?? 0, checkLoading, t)}
        </Button>
        <span aria-atomic="true" aria-live="polite" className="saved-state">
          {workspaceLoading || draft == null ? null : <Icon name="check" size={16} />}
          {t(`workspace.status.${displayedStatus}`)}
        </span>
        {targetFlow?.draft != null && (
          <span className="action-help" title={draftRunUnavailable}>
            <Button
              aria-controls="run-input-panel"
              aria-expanded={runInputRequest?.source == 'draft'}
              aria-describedby={draftRunUnavailable == null ? undefined : 'draft-run-unavailable'}
              disabled={busy != null || invalid || runInputRequest != null}
              onClick={onRunDraft}
              variant="outline"
            >
              <Icon data-icon="inline-start" name="play" />
              {t(busy == 'run' ? 'workspace.starting' : 'workspace.runDraft')}
            </Button>
            {draftRunUnavailable != null && (
              <span className="sr-only" id="draft-run-unavailable">
                {draftRunUnavailable}
              </span>
            )}
          </span>
        )}
        {targetFlow?.live != null && (
          <span className="action-help" title={liveRunUnavailable}>
            <Button
              aria-controls="run-input-panel"
              aria-expanded={runInputRequest?.source == 'live'}
              aria-describedby={liveRunUnavailable == null ? undefined : 'live-run-unavailable'}
              disabled={busy != null || targetFlow.live.status == 'suspended' || runInputRequest != null}
              onClick={onRunLive}
              variant="outline"
            >
              <Icon data-icon="inline-start" name="play" />
              {t(busy == 'run' ? 'workspace.starting' : 'workspace.runLive')}
            </Button>
            {liveRunUnavailable != null && (
              <span className="sr-only" id="live-run-unavailable">
                {liveRunUnavailable}
              </span>
            )}
          </span>
        )}
        <span className="action-help" title={publishUnavailable}>
          <Button
            aria-describedby={publishUnavailable == null ? undefined : 'publish-unavailable'}
            disabled={busy != null || targetFlow?.draft == null || invalid || !targetFlow.hasUnpublishedChanges}
            onClick={() => void store.publications.publish()}
          >
            <Icon data-icon="inline-start" name="publish" />
            {t(busy == 'publish' ? 'workspace.publishing' : 'publication.publishDraft')}
          </Button>
          {publishUnavailable != null && (
            <span className="sr-only" id="publish-unavailable">
              {publishUnavailable}
            </span>
          )}
        </span>
      </div>
      {diagnosticsOpen && (
        <DiagnosticsPanel
          checked={diagnostics != null}
          checking={checkLoading}
          items={diagnosticItems}
          onClose={() => {
            setDiagnosticsOpen(false)
            diagnosticsButton.current?.focus()
          }}
          onRefresh={() => void store.workspace.check()}
          onSelect={(item) => {
            onOpenDesign()
            if (store.workspace.locateDiagnostic(item)) setDiagnosticsOpen(false)
          }}
        />
      )}
    </header>
  )
}
