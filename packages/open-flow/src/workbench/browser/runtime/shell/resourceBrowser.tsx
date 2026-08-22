import type { FormEvent, ReactElement } from 'react'
import type { Flow } from '../api.ts'
import type { Project } from '../api.ts'
import type { WorkbenchLanguage } from '../contract.ts'
import type { WorkbenchStore } from '../stores/workbenchStore.ts'
import type { WorkspaceBusy } from '../stores/workspaceModel.ts'

import { lazy, Suspense, useState } from 'react'
import { useVal } from 'use-value-enhancer'
import { useLang, useTranslate } from 'val-i18n-react'
import { resourceNameIssue, resourceNameMaxLength } from '../../../../project/common/change.ts'
import { Icon } from '../icons.tsx'

const CreateResourceDialog = lazy(() => import('./createResourceDialog.tsx'))

interface LanguageSelectProps {
  readonly language: WorkbenchLanguage
  readonly onLanguageChange?: ((language: WorkbenchLanguage) => void) | undefined
}

export function LanguageSelect({ language, onLanguageChange }: LanguageSelectProps): ReactElement | null {
  const t = useTranslate()
  if (onLanguageChange == null) return null
  return (
    <label className="resource-language">
      <span className="sr-only">{t('language.label')}</span>
      <select aria-label={t('language.label')} onChange={(event) => onLanguageChange(event.target.value as WorkbenchLanguage)} value={language}>
        <option value="en">{t('language.english')}</option>
        <option value="zh-CN">{t('language.simplifiedChinese')}</option>
      </select>
      <Icon name="chevron-down" size={14} />
    </label>
  )
}

interface ProjectBrowserProps extends LanguageSelectProps {
  readonly onCreateProject: (name: string) => Promise<boolean>
  readonly onSelectProject: (projectId: string) => void
  readonly store: WorkbenchStore
}

interface ProjectItemProps {
  readonly busy: WorkspaceBusy | undefined
  readonly onSelect: (projectId: string) => void
  readonly project: Project
  readonly store: WorkbenchStore
}

function ProjectItem({ busy, onSelect, project, store }: ProjectItemProps): ReactElement {
  const locale = useLang()
  const t = useTranslate()
  const [mode, setMode] = useState<'actions' | 'delete' | 'idle'>('idle')

  async function remove(): Promise<void> {
    if (await store.workspace.deleteProject(project.projectId)) setMode('idle')
  }

  return (
    <div className="resource-item-row">
      <button
        className="resource-list-row project-columns"
        disabled={project.status == 'retiring'}
        onClick={() => {
          setMode('idle')
          onSelect(project.projectId)
        }}
        title={project.status == 'retiring' ? t('resource.projectRetiringDescription') : project.name}
        type="button"
      >
        <span className="resource-primary-cell">
          <span className="resource-icon">
            <Icon name="project" size={16} />
          </span>
          <span>
            <strong>{project.name}</strong>
            <code>{project.projectId}</code>
          </span>
        </span>
        <time dateTime={project.updatedAt}>{new Date(project.updatedAt).toLocaleString(locale)}</time>
        <span className={`resource-status ${project.status == 'active' ? 'active' : 'warning'}`}>
          <span className={`status-dot ${project.status == 'active' ? 'success' : 'running'}`} />
          {t(project.status == 'active' ? 'resource.active' : 'resource.retiring')}
        </span>
      </button>
      {project.status == 'active' && (
        <button
          aria-expanded={mode != 'idle'}
          aria-label={t('resource.projectActions', { name: project.name })}
          className={`icon-button resource-row-more ${mode != 'idle' ? 'active' : ''}`}
          disabled={busy != null}
          onClick={() => setMode(mode == 'idle' ? 'actions' : 'idle')}
          type="button"
        >
          <Icon name="more" size={16} />
        </button>
      )}
      {mode == 'actions' && (
        <div className="resource-row-actions">
          <button className="button secondary small danger" onClick={() => setMode('delete')} type="button">
            {t('common.delete')}
          </button>
        </div>
      )}
      {mode == 'delete' && (
        <div className="resource-row-confirm" role="group" aria-label={t('resource.deleteProject', { name: project.name })}>
          <span>
            <strong>{t('resource.deleteProjectConfirm', { name: project.name })}</strong>
            <small>{t('resource.deleteProjectDescription')}</small>
          </span>
          <div>
            <button className="button secondary small" onClick={() => setMode('idle')} type="button">
              {t('common.cancel')}
            </button>
            <button className="button secondary small danger" disabled={busy != null} onClick={() => void remove()} type="button">
              {t(busy == 'project' ? 'common.deleting' : 'common.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ProjectBrowser({ language, onCreateProject, onLanguageChange, onSelectProject, store }: ProjectBrowserProps): ReactElement {
  const t = useTranslate()
  const busy = useVal(store.workspace.$.busy)
  const loadFailed = useVal(store.workspace.$.projectLoadFailed)
  const loadMoreFailed = useVal(store.workspace.$.projectLoadMoreFailed)
  const loading = useVal(store.workspace.$.projectLoading)
  const loadingMore = useVal(store.workspace.$.projectLoadingMore)
  const nextCursor = useVal(store.workspace.$.projectNextCursor)
  const projects = useVal(store.workspace.$.projects)
  const total = useVal(store.workspace.$.projectTotal)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  const [name, setName] = useState('')
  const normalizedFilter = filter.trim().toLocaleLowerCase()
  const visibleProjects = projects.filter((project) => project.name.toLocaleLowerCase().includes(normalizedFilter))

  async function createProject(event: FormEvent): Promise<void> {
    event.preventDefault()
    const nextName = name.trim()
    if (resourceNameIssue(nextName) != null || !(await onCreateProject(nextName))) return
    setCreating(false)
    setName('')
  }

  return (
    <main className="resource-browser">
      <div className="resource-page">
        <header className="resource-page-header">
          <div className="resource-heading">
            <span className="resource-eyebrow">{t('resource.workflows')}</span>
            <h1>{t('resource.projects')}</h1>
            <p>{t('resource.projectsDescription')}</p>
          </div>
          <LanguageSelect language={language} onLanguageChange={onLanguageChange} />
        </header>
        <section aria-labelledby="project-list-title" className="resource-list-section">
          <div className="resource-list-title">
            <div className="resource-list-heading">
              <h2 id="project-list-title">{t('resource.allProjects')}</h2>
              {!loading && <span>{t('resource.projectCount', { count: total ?? projects.length })}</span>}
            </div>
            <button className="button primary" disabled={busy != null} onClick={() => setCreating(true)} type="button">
              <Icon name="plus" size={15} />
              {t('resource.newProject')}
            </button>
          </div>
          <div className="resource-toolbar">
            <div className="search-field">
              <Icon name="search" size={17} />
              <input
                aria-label={t('resource.searchProjects')}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('resource.searchProjects')}
                value={filter}
              />
            </div>
          </div>
          <div aria-hidden="true" className="resource-list-columns project-columns">
            <span>{t('resource.name')}</span>
            <span>{t('resource.updated')}</span>
            <span>{t('resource.status')}</span>
          </div>
          <div className="resource-list">
            {loading ? (
              Array.from({ length: 5 }, (_, index) => <span className="resource-row-skeleton" key={index} />)
            ) : loadFailed ? (
              <div className="resource-empty" role="alert">
                <span className="empty-icon">
                  <Icon name="alert" size={20} />
                </span>
                <strong>{t('resource.projectsLoadFailed')}</strong>
                <span>{t('resource.projectsLoadFailedDescription')}</span>
                <button className="button secondary" onClick={() => void store.retryProjects()} type="button">
                  {t('empty.retry')}
                </button>
              </div>
            ) : visibleProjects.length == 0 ? (
              <div className="resource-empty">
                <span className="empty-icon">
                  <Icon name="project" size={20} />
                </span>
                <strong>{t(normalizedFilter.length == 0 ? 'resource.noProjects' : 'resource.noMatchingProjects')}</strong>
                <span>{t(normalizedFilter.length == 0 ? 'resource.noProjectsDescription' : 'resource.noMatchingDescription')}</span>
                {normalizedFilter.length == 0 && (
                  <button className="button secondary" onClick={() => setCreating(true)} type="button">
                    <Icon name="plus" size={15} /> {t('resource.newProject')}
                  </button>
                )}
              </div>
            ) : (
              visibleProjects.map((project) => <ProjectItem busy={busy} key={project.projectId} onSelect={onSelectProject} project={project} store={store} />)
            )}
          </div>
          {nextCursor != null && (
            <button className="resource-load-more" disabled={loadingMore} onClick={() => void store.workspace.loadMoreProjects()} type="button">
              {t(loadingMore ? 'resource.loadingMore' : loadMoreFailed ? 'resource.retryLoadMore' : 'resource.loadMore')}
            </button>
          )}
        </section>
        {creating && (
          <Suspense fallback={null}>
            <CreateResourceDialog
              id="project-name"
              issue={resourceNameIssue(name)}
              label={t('resource.projectName')}
              name={name}
              onNameChange={setName}
              onOpenChange={setCreating}
              onSubmit={(event) => void createProject(event)}
              pending={busy == 'project'}
              title={t('resource.newProject')}
            />
          </Suspense>
        )}
      </div>
    </main>
  )
}

interface FlowBrowserProps extends LanguageSelectProps {
  readonly onCreateFlow: (name: string) => Promise<boolean>
  readonly onOpenProjects: () => void
  readonly onSelectFlow: (flow: Flow) => void
  readonly store: WorkbenchStore
}

function flowStatus(flow: Flow): { readonly dot: 'running' | 'success'; readonly key: string } {
  if (flow.live?.status == 'suspended') return { dot: 'running', key: 'resource.suspended' }
  if (flow.draft != null && flow.live != null) return { dot: 'success', key: 'resource.liveAndDraft' }
  if (flow.live != null) return { dot: 'success', key: 'resource.liveOnly' }
  return { dot: 'running', key: 'resource.draft' }
}

interface FlowItemProps {
  readonly busy: WorkspaceBusy | undefined
  readonly flow: Flow
  readonly onSelect: (flow: Flow) => void
  readonly store: WorkbenchStore
}

function FlowItem({ busy, flow, onSelect, store }: FlowItemProps): ReactElement {
  const t = useTranslate()
  const draft = flow.draft
  const status = flowStatus(flow)
  const [mode, setMode] = useState<'actions' | 'delete' | 'idle' | 'rename'>('idle')
  const [name, setName] = useState(draft?.name ?? '')
  const nameIssue = resourceNameIssue(name)
  const showNameIssue = name.length > 0 && nameIssue != null
  const nameMessageId = `rename-flow-${flow.flowId}-message`

  async function rename(event: FormEvent): Promise<void> {
    event.preventDefault()
    const nextName = name.trim()
    if (resourceNameIssue(nextName) == null && (await store.workspace.renameFlow(flow.flowId, nextName))) setMode('idle')
  }

  async function remove(): Promise<void> {
    if (await store.workspace.deleteFlow(flow.flowId)) setMode('idle')
  }

  return (
    <div className="resource-item-row">
      <button
        className="resource-list-row flow-columns"
        onClick={() => {
          setMode('idle')
          onSelect(flow)
        }}
        type="button"
      >
        <span className="resource-primary-cell">
          <span className="resource-icon">
            <Icon name="flow" size={16} />
          </span>
          <span>
            <strong>{draft?.name ?? flow.flowId}</strong>
            <code>{flow.flowId}</code>
          </span>
        </span>
        <span className={`resource-change ${flow.hasUnpublishedChanges ? 'pending' : ''}`}>
          {t(flow.hasUnpublishedChanges ? 'resource.unpublishedChanges' : 'resource.upToDate')}
        </span>
        <span className="resource-status">
          <span className={`status-dot ${status.dot}`} />
          {t(status.key)}
        </span>
      </button>
      {draft != null && (
        <button
          aria-expanded={mode != 'idle'}
          aria-label={t('sidebar.flowActions', { name: draft.name })}
          className={`icon-button resource-row-more ${mode != 'idle' ? 'active' : ''}`}
          disabled={busy != null}
          onClick={() => setMode(mode == 'idle' ? 'actions' : 'idle')}
          type="button"
        >
          <Icon name="more" size={16} />
        </button>
      )}
      {mode == 'actions' && draft != null && (
        <div className="resource-row-actions">
          <button
            className="button secondary small"
            onClick={() => {
              setName(draft.name)
              setMode('rename')
            }}
            type="button"
          >
            {t('common.rename')}
          </button>
          <button className="button secondary small danger" onClick={() => setMode('delete')} type="button">
            {t('common.delete')}
          </button>
        </div>
      )}
      {mode == 'rename' && draft != null && (
        <form className="resource-row-form" onSubmit={(event) => void rename(event)}>
          <label htmlFor={`rename-flow-${flow.flowId}`}>{t('sidebar.renameFlow', { name: draft.name })}</label>
          <span className="resource-row-field">
            <input
              aria-describedby={showNameIssue ? nameMessageId : undefined}
              aria-invalid={showNameIssue}
              autoFocus
              id={`rename-flow-${flow.flowId}`}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
            {showNameIssue && (
              <small className="resource-name-message error" id={nameMessageId}>
                {t(`resource.nameIssue.${nameIssue}`, { max: resourceNameMaxLength })}
              </small>
            )}
          </span>
          <div>
            <button className="button secondary small" onClick={() => setMode('idle')} type="button">
              {t('common.cancel')}
            </button>
            <button className="button primary small" disabled={busy != null || nameIssue != null} type="submit">
              {t('common.save')}
            </button>
          </div>
        </form>
      )}
      {mode == 'delete' && draft != null && (
        <div className="resource-row-confirm" role="group" aria-label={t('sidebar.deleteFlow', { name: draft.name })}>
          <span>
            <strong>{t('sidebar.deleteFlowConfirm', { name: draft.name })}</strong>
            {flow.live != null && <small>{t('sidebar.deleteFlowLiveNote')}</small>}
          </span>
          <div>
            <button className="button secondary small" onClick={() => setMode('idle')} type="button">
              {t('common.cancel')}
            </button>
            <button className="button secondary small danger" disabled={busy != null} onClick={() => void remove()} type="button">
              {t(busy == 'resource' ? 'common.deleting' : 'common.delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function FlowBrowser({ language, onCreateFlow, onLanguageChange, onOpenProjects, onSelectFlow, store }: FlowBrowserProps): ReactElement {
  const t = useTranslate()
  const busy = useVal(store.workspace.$.busy)
  const draft = useVal(store.workspace.$.draft)
  const flows = useVal(store.workspace.$.flows)
  const project = useVal(store.workspace.$.project)
  const projectId = useVal(store.workspace.$.projectId)
  const loadFailed = useVal(store.workspace.$.workspaceLoadFailed)
  const loading = useVal(store.workspace.$.workspaceLoading)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState('')
  const [name, setName] = useState('')
  const normalizedFilter = filter.trim().toLocaleLowerCase()
  const visibleFlows = flows.filter((flow) => (flow.draft?.name ?? flow.flowId).toLocaleLowerCase().includes(normalizedFilter))

  async function createFlow(event: FormEvent): Promise<void> {
    event.preventDefault()
    const nextName = name.trim()
    if (resourceNameIssue(nextName) != null || !(await onCreateFlow(nextName))) return
    setCreating(false)
    setName('')
  }

  return (
    <main className="resource-browser">
      <div className="resource-page">
        <header className="resource-page-header">
          <div className="resource-heading">
            <nav aria-label={t('resource.breadcrumb')} className="resource-breadcrumb">
              <button onClick={onOpenProjects} type="button">
                {t('resource.workflows')}
              </button>
              <span>/</span>
              <span>{project?.name ?? projectId}</span>
            </nav>
            <h1>{t('resource.flows')}</h1>
            <p>{t('resource.flowsDescription')}</p>
          </div>
          <LanguageSelect language={language} onLanguageChange={onLanguageChange} />
        </header>
        <section aria-labelledby="flow-list-title" className="resource-list-section">
          <div className="resource-list-title">
            <div className="resource-list-heading">
              <h2 id="flow-list-title">{t('resource.allFlows')}</h2>
              {!loading && <span>{t('resource.flowCount', { count: flows.length })}</span>}
            </div>
            <button
              className="button primary"
              disabled={busy != null || draft == null || project?.status == 'retiring'}
              onClick={() => setCreating(true)}
              type="button"
            >
              <Icon name="plus" size={15} />
              {t('resource.newFlow')}
            </button>
          </div>
          <div className="resource-toolbar">
            <div className="search-field">
              <Icon name="search" size={17} />
              <input
                aria-label={t('resource.searchFlows')}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('resource.searchFlows')}
                value={filter}
              />
            </div>
          </div>
          <div aria-hidden="true" className="resource-list-columns flow-columns">
            <span>{t('resource.name')}</span>
            <span>{t('resource.changes')}</span>
            <span>{t('resource.status')}</span>
          </div>
          <div className="resource-list">
            {loading ? (
              Array.from({ length: 5 }, (_, index) => <span className="resource-row-skeleton" key={index} />)
            ) : loadFailed ? (
              <div className="resource-empty" role="alert">
                <span className="empty-icon">
                  <Icon name="alert" size={20} />
                </span>
                <strong>{t('resource.flowsLoadFailed')}</strong>
                <span>{t('resource.flowsLoadFailedDescription')}</span>
                {projectId != null && (
                  <button className="button secondary" onClick={() => void store.selectProject(projectId)} type="button">
                    {t('empty.retry')}
                  </button>
                )}
              </div>
            ) : visibleFlows.length == 0 ? (
              <div className="resource-empty">
                <span className="empty-icon">
                  <Icon name="flow" size={20} />
                </span>
                <strong>{t(normalizedFilter.length == 0 ? 'resource.noFlows' : 'resource.noMatchingFlows')}</strong>
                <span>{t(normalizedFilter.length == 0 ? 'resource.noFlowsDescription' : 'resource.noMatchingDescription')}</span>
                {normalizedFilter.length == 0 && draft != null && (
                  <button className="button secondary" onClick={() => setCreating(true)} type="button">
                    <Icon name="plus" size={15} /> {t('resource.newFlow')}
                  </button>
                )}
              </div>
            ) : (
              visibleFlows.map((flow) => <FlowItem busy={busy} flow={flow} key={flow.flowId} onSelect={onSelectFlow} store={store} />)
            )}
          </div>
        </section>
        {creating && (
          <Suspense fallback={null}>
            <CreateResourceDialog
              id="flow-name"
              issue={resourceNameIssue(name)}
              label={t('resource.flowName')}
              name={name}
              onNameChange={setName}
              onOpenChange={setCreating}
              onSubmit={(event) => void createFlow(event)}
              pending={busy == 'resource'}
              title={t('resource.newFlow')}
            />
          </Suspense>
        )}
      </div>
    </main>
  )
}
