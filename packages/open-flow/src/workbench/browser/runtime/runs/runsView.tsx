import type { ReactElement } from 'react'
import type { TFunction } from 'val-i18n'
import type { Run, TriggerRun } from '../api.ts'
import type { WorkbenchStore } from '../stores/workbenchStore.ts'

import { useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useLang, useTranslate } from 'val-i18n-react'
import { Icon } from '../icons.tsx'
import { duration, navigateRunTabs, RunDetails, RunEventFilters, RunLogButton, runLabel, statusClass } from './runDrawer.tsx'
import { canCancelRun } from './runStore.ts'

function sourceLabel(run: Run, t: TFunction): string {
  switch (run.source) {
    case 'draft':
      return t('run.sourceDraft')
    case 'live':
      return t('run.sourceLive')
    case 'trigger':
      return t('run.sourceTrigger')
  }
}

function shortRunId(runId: string): string {
  return runId.slice(-8)
}

export function RunsView({ onLocateEvent, store }: { readonly onLocateEvent: (sequence: number) => void; readonly store: WorkbenchStore }): ReactElement {
  const language = useLang()
  const t = useTranslate()
  const eventFilter = useVal(store.runs.$.eventFilter)
  const eventNodes = useVal(store.$.runEventNodes)
  const cancelingRunId = useVal(store.runs.$.cancelingRunId)
  const events = useVal(store.runs.$.events)
  const eventsExpiresAt = useVal(store.runs.$.eventsExpiresAt)
  const historyComplete = useVal(store.runs.$.historyComplete)
  const loadFailed = useVal(store.runs.$.loadFailed)
  const loading = useVal(store.runs.$.loading)
  const loadMoreFailed = useVal(store.runs.$.loadMoreFailed)
  const loadingMore = useVal(store.runs.$.loadingMore)
  const nextCursor = useVal(store.runs.$.nextCursor)
  const result = useVal(store.runs.$.result)
  const run = useVal(store.runs.$.run)
  const runs = useVal(store.runs.$.runs)
  const observationFailed = useVal(store.runs.$.observationFailed)
  const revision = useVal(store.workspace.$.revision)
  const [tab, setTab] = useState<'output' | 'timeline'>('timeline')
  const triggerRun = run?.source == 'trigger' && 'triggerNodeId' in run ? (run as TriggerRun) : undefined
  const triggerName =
    triggerRun != null && revision?.revision.revisionId == triggerRun.revisionId
      ? revision.trigger(triggerRun.flowId, triggerRun.triggerNodeId)?.name
      : undefined

  return (
    <section aria-labelledby="workspace-tab-runs" className="runs-view" id="workspace-panel-runs" role="tabpanel" tabIndex={0}>
      <aside className="run-list-panel">
        <header className="run-list-header">
          <strong>{t('run.history')}</strong>
        </header>
        <div className="run-list">
          {loading ? (
            <div className="run-list-empty">{t('run.loading')}</div>
          ) : loadFailed ? (
            <div className="run-list-empty" role="alert">
              <strong>{t('run.historyLoadFailed')}</strong>
              <button className="button secondary small" onClick={() => void store.runs.retryLoad()} type="button">
                {t('empty.retry')}
              </button>
            </div>
          ) : runs.length == 0 ? (
            <div className="run-list-empty">
              <span className="empty-icon">
                <Icon name="play" size={20} />
              </span>
              <strong>{t('run.historyEmpty')}</strong>
              <span>{t('run.historyEmptyDescription')}</span>
            </div>
          ) : (
            runs.map((candidate) => (
              <button
                aria-current={candidate.runId == run?.runId ? 'true' : undefined}
                className={`run-list-item ${candidate.runId == run?.runId ? 'active' : ''}`}
                key={candidate.runId}
                onClick={() => store.runs.select(candidate.runId)}
                type="button"
              >
                <span className={`status-dot ${statusClass(candidate)}`} />
                <span className="run-list-copy">
                  <code className="run-list-id" title={candidate.runId}>
                    <span aria-hidden="true">{shortRunId(candidate.runId)}</span>
                    <span className="sr-only">{candidate.runId}</span>
                  </code>
                  <span className="run-list-meta">
                    {runLabel(candidate, t)} · {sourceLabel(candidate, t)}
                  </span>
                </span>
                <span className="run-list-time">
                  <time>{new Date(candidate.createdAt).toLocaleString(language)}</time>
                  <span>{duration(candidate)}</span>
                </span>
              </button>
            ))
          )}
        </div>
        {nextCursor != null && (
          <button className="run-load-more" disabled={loadingMore} onClick={() => void store.runs.loadMore()} type="button">
            {t(loadingMore ? 'run.loadingMore' : loadMoreFailed ? 'run.retryLoadMore' : 'run.loadMore')}
          </button>
        )}
      </aside>
      <section className="run-detail-panel">
        {run == null ? (
          <div className="run-detail-empty">{t('run.selectRun')}</div>
        ) : (
          <>
            <header className="run-detail-header">
              <div>
                <span className={`status-dot ${statusClass(run)}`} />
                <strong>{runLabel(run, t)}</strong>
                <span className="run-source">{sourceLabel(run, t)}</span>
              </div>
              <div className="run-detail-actions">
                <div className="run-detail-meta">
                  <span>
                    {t('run.duration')}: {duration(run)}
                  </span>
                  <time>{new Date(run.createdAt).toLocaleString(language)}</time>
                  {triggerRun != null && (
                    <>
                      <span title={triggerRun.triggerNodeId}>
                        {t('run.triggerNode')}: {triggerName ?? triggerRun.triggerNodeId}
                      </span>
                      <span title={triggerRun.occurrenceId}>
                        {t('run.triggerOccurrence')}: {triggerRun.occurrenceId}
                      </span>
                      <span title={triggerRun.publicationId}>
                        {t('run.triggerPublication')}: {triggerRun.publicationId}
                      </span>
                    </>
                  )}
                  <code>{run.runId}</code>
                </div>
                <RunLogButton events={events} eventsExpiresAt={eventsExpiresAt} historyComplete={historyComplete} run={run} />
                {canCancelRun(run) && (
                  <button className="button secondary small danger" disabled={cancelingRunId != null} onClick={() => void store.runs.cancel()} type="button">
                    {t(cancelingRunId == run.runId ? 'run.canceling' : 'run.cancel')}
                  </button>
                )}
              </div>
            </header>
            <div className="run-history-content">
              <div className="run-toolbar">
                <div aria-label={t('run.detailViews')} className="run-tabs" onKeyDown={navigateRunTabs} role="tablist">
                  <button
                    aria-controls="run-history-timeline-panel"
                    aria-selected={tab == 'timeline'}
                    className={`run-tab ${tab == 'timeline' ? 'active' : ''}`}
                    id="run-history-timeline-tab"
                    onClick={() => setTab('timeline')}
                    role="tab"
                    tabIndex={tab == 'timeline' ? 0 : -1}
                    type="button"
                  >
                    {t('run.timeline')}
                  </button>
                  <button
                    aria-controls="run-history-output-panel"
                    aria-selected={tab == 'output'}
                    className={`run-tab ${tab == 'output' ? 'active' : ''}`}
                    id="run-history-output-tab"
                    onClick={() => setTab('output')}
                    role="tab"
                    tabIndex={tab == 'output' ? 0 : -1}
                    type="button"
                  >
                    {t('run.output')}
                  </button>
                </div>
                {tab == 'timeline' && <RunEventFilters events={events} filter={eventFilter} onChange={(filter) => store.runs.setEventFilter(filter)} />}
              </div>
              <RunDetails
                events={events}
                eventsExpiresAt={eventsExpiresAt}
                eventFilter={eventFilter}
                eventNodes={eventNodes}
                historyComplete={historyComplete}
                observationFailed={observationFailed}
                onLocateEvent={onLocateEvent}
                onRetryObservation={() => store.runs.retryObservation()}
                panelId={`run-history-${tab}-panel`}
                result={result}
                run={run}
                submitting={false}
                tab={tab}
                tabId={`run-history-${tab}-tab`}
              />
            </div>
          </>
        )}
      </section>
    </section>
  )
}
