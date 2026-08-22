import type { KeyboardEvent, ReactElement } from 'react'
import type { TFunction } from 'val-i18n'
import type { Flow } from '../api.ts'
import type { WorkbenchLanguage } from '../contract.ts'
import type { WorkbenchStore } from '../stores/workbenchStore.ts'

import { useEffect, useRef, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { Icon } from '../icons.tsx'
import { DiagnosticsPanel } from './diagnosticsPanel.tsx'
import { LanguageSelect } from './resourceBrowser.tsx'

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

function navigateTabs(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key != 'ArrowLeft' && event.key != 'ArrowRight' && event.key != 'Home' && event.key != 'End') return
  const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)')]
  const current = tabs.indexOf(document.activeElement as HTMLButtonElement)
  const index = event.key == 'Home' ? 0 : event.key == 'End' ? tabs.length - 1 : (current + (event.key == 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
  event.preventDefault()
  tabs[index]?.focus()
  tabs[index]?.click()
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

  return (
    <header className="workspace-header">
      <div className="workspace-title">
        <button onClick={onOpenProjects} type="button">
          {t('resource.workflows')}
        </button>
        <span>/</span>
        <button onClick={onOpenProject} type="button">
          {project?.name ?? project?.projectId ?? t('resource.projects')}
        </button>
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
      <div aria-label={t('workspace.views')} className="workspace-tabs" onKeyDown={navigateTabs} role="tablist">
        <button
          aria-controls="workspace-panel-design"
          aria-selected={activeView == 'design'}
          className={activeView == 'design' ? 'active' : ''}
          disabled={targetFlow != null && targetFlow.draft == null}
          id="workspace-tab-design"
          onClick={onOpenDesign}
          role="tab"
          tabIndex={activeView == 'design' ? 0 : -1}
          type="button"
        >
          {t('workspace.design')}
        </button>
        <button
          aria-controls="workspace-panel-runs"
          aria-selected={activeView == 'runs'}
          className={activeView == 'runs' ? 'active' : ''}
          id="workspace-tab-runs"
          onClick={onOpenRuns}
          role="tab"
          tabIndex={activeView == 'runs' ? 0 : -1}
          type="button"
        >
          {t('workspace.runs')}
        </button>
        <button
          aria-controls="workspace-panel-publications"
          aria-selected={activeView == 'publications'}
          className={activeView == 'publications' ? 'active' : ''}
          disabled={targetFlow == null}
          id="workspace-tab-publications"
          onClick={onOpenPublications}
          role="tab"
          tabIndex={activeView == 'publications' ? 0 : -1}
          type="button"
        >
          {t('workspace.publications')}
        </button>
      </div>
      <div className="workspace-actions">
        <LanguageSelect language={language} onLanguageChange={onLanguageChange} />
        <button
          aria-controls="diagnostics-panel"
          aria-expanded={diagnosticsOpen}
          className={`validation-state ${diagnostics?.valid == false ? 'invalid' : ''}`}
          disabled={target == null || (target.kind == 'flow' && targetFlow?.draft == null) || checkLoading}
          onClick={() => {
            store.runRequests.dismissInputs()
            setDiagnosticsOpen(!diagnosticsOpen)
          }}
          ref={diagnosticsButton}
          title={t('diagnostics.open')}
          type="button"
        >
          <Icon name={diagnostics?.valid == false ? 'alert' : 'check'} size={15} />
          {validationLabel(diagnostics?.valid, diagnostics?.diagnostics.length ?? 0, checkLoading, t)}
        </button>
        <span className="saved-state">
          {workspaceLoading || draft == null ? null : <Icon name="check" size={16} />}
          {t(`workspace.status.${status}`)}
        </span>
        {targetFlow?.draft != null && (
          <span className="action-help" title={draftRunUnavailable}>
            <button
              aria-controls="run-input-panel"
              aria-expanded={runInputRequest?.source == 'draft'}
              aria-describedby={draftRunUnavailable == null ? undefined : 'draft-run-unavailable'}
              className="button secondary"
              disabled={busy != null || invalid || runInputRequest != null}
              onClick={onRunDraft}
              type="button"
            >
              <Icon name="play" size={15} />
              {t(busy == 'run' ? 'workspace.starting' : 'workspace.runDraft')}
            </button>
            {draftRunUnavailable != null && (
              <span className="sr-only" id="draft-run-unavailable">
                {draftRunUnavailable}
              </span>
            )}
          </span>
        )}
        {targetFlow?.live != null && (
          <span className="action-help" title={liveRunUnavailable}>
            <button
              aria-controls="run-input-panel"
              aria-expanded={runInputRequest?.source == 'live'}
              aria-describedby={liveRunUnavailable == null ? undefined : 'live-run-unavailable'}
              className="button secondary"
              disabled={busy != null || targetFlow.live.status == 'suspended' || runInputRequest != null}
              onClick={onRunLive}
              type="button"
            >
              <Icon name="play" size={15} />
              {t(busy == 'run' ? 'workspace.starting' : 'workspace.runLive')}
            </button>
            {liveRunUnavailable != null && (
              <span className="sr-only" id="live-run-unavailable">
                {liveRunUnavailable}
              </span>
            )}
          </span>
        )}
        <span className="action-help" title={publishUnavailable}>
          <button
            aria-describedby={publishUnavailable == null ? undefined : 'publish-unavailable'}
            className="button primary"
            disabled={busy != null || targetFlow?.draft == null || invalid || !targetFlow.hasUnpublishedChanges}
            onClick={() => void store.publications.publish()}
            type="button"
          >
            <Icon name="publish" size={15} />
            {t(busy == 'publish' ? 'workspace.publishing' : 'publication.publishDraft')}
          </button>
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
