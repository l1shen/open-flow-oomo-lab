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
import { Button } from '../../../../ui/browser/button.tsx'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '../../../../ui/browser/empty.tsx'
import { InputGroup, InputGroupAddon, InputGroupInput } from '../../../../ui/browser/input-group.tsx'
import { Input } from '../../../../ui/browser/input.tsx'
import { Skeleton } from '../../../../ui/browser/skeleton.tsx'
import { cn } from '../../../../ui/browser/utils.ts'
import { Icon } from '../icons.tsx'
import { WorkbenchSelect } from './workbenchSelect.tsx'

const CreateResourceDialog = lazy(() => import('./createResourceDialog.tsx'))

interface LanguageSelectProps {
  readonly language: WorkbenchLanguage
  readonly onLanguageChange?: ((language: WorkbenchLanguage) => void) | undefined
}

export function LanguageSelect({ language, onLanguageChange }: LanguageSelectProps): ReactElement | null {
  const t = useTranslate()
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null)
  if (onLanguageChange == null) return null
  return (
    <div className="resource-language" ref={setPortalRoot}>
      <span className="sr-only">{t('language.label')}</span>
      <WorkbenchSelect
        ariaLabel={t('language.label')}
        onValueChange={(value) => onLanguageChange(value as WorkbenchLanguage)}
        options={[
          { label: t('language.english'), value: 'en' },
          { label: t('language.simplifiedChinese'), value: 'zh-CN' },
        ]}
        portalRoot={portalRoot}
        value={language}
      />
    </div>
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
      <Button
        className="resource-list-row project-columns"
        disabled={project.status == 'retiring'}
        onClick={() => {
          setMode('idle')
          onSelect(project.projectId)
        }}
        title={project.status == 'retiring' ? t('resource.projectRetiringDescription') : project.name}
        type="button"
        variant="ghost"
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
      </Button>
      {project.status == 'active' && (
        <Button
          aria-expanded={mode != 'idle'}
          aria-label={t('resource.projectActions', { name: project.name })}
          aria-pressed={mode != 'idle'}
          className={cn('resource-row-more', mode != 'idle' && 'active')}
          disabled={busy != null}
          onClick={() => setMode(mode == 'idle' ? 'actions' : 'idle')}
          size="icon-sm"
          variant="ghost"
        >
          <Icon name="more" size={16} />
        </Button>
      )}
      {mode == 'actions' && (
        <div className="resource-row-actions">
          <Button onClick={() => setMode('delete')} size="sm" variant="destructive">
            {t('common.delete')}
          </Button>
        </div>
      )}
      {mode == 'delete' && (
        <div className="resource-row-confirm" role="group" aria-label={t('resource.deleteProject', { name: project.name })}>
          <span>
            <strong>{t('resource.deleteProjectConfirm', { name: project.name })}</strong>
            <small>{t('resource.deleteProjectDescription')}</small>
          </span>
          <div>
            <Button onClick={() => setMode('idle')} size="sm" variant="outline">
              {t('common.cancel')}
            </Button>
            <Button disabled={busy != null} onClick={() => void remove()} size="sm" variant="destructive">
              {t(busy == 'project' ? 'common.deleting' : 'common.delete')}
            </Button>
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
            <div className="resource-list-actions">
              <InputGroup className="w-full sm:w-56">
                <InputGroupAddon>
                  <Icon name="search" size={17} />
                </InputGroupAddon>
                <InputGroupInput
                  autoComplete="off"
                  aria-label={t('resource.searchProjects')}
                  name="project-search"
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t('resource.searchProjects')}
                  value={filter}
                />
              </InputGroup>
              <Button
                aria-label={t('common.refresh')}
                disabled={loading || busy != null}
                onClick={() => void store.workspace.reloadProjects()}
                size="icon"
                title={t('common.refresh')}
                variant="outline"
              >
                <Icon name="refresh" size={16} />
              </Button>
              <Button disabled={busy != null} onClick={() => setCreating(true)}>
                <Icon data-icon="inline-start" name="plus" size={15} />
                {t('resource.newProject')}
              </Button>
            </div>
          </div>
          <div aria-hidden="true" className="resource-list-columns project-columns">
            <span>{t('resource.name')}</span>
            <span>{t('resource.updated')}</span>
            <span>{t('resource.status')}</span>
          </div>
          <div className="resource-list">
            {loading ? (
              Array.from({ length: 5 }, (_, index) => <Skeleton className="h-14 rounded-none" key={index} />)
            ) : loadFailed ? (
              <Empty className="min-h-64 border-0" role="alert">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon name="alert" size={20} />
                  </EmptyMedia>
                  <EmptyTitle>{t('resource.projectsLoadFailed')}</EmptyTitle>
                  <EmptyDescription>{t('resource.projectsLoadFailedDescription')}</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => void store.retryProjects()} variant="outline">
                    {t('empty.retry')}
                  </Button>
                </EmptyContent>
              </Empty>
            ) : visibleProjects.length == 0 ? (
              <Empty className="min-h-64 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon name="project" size={20} />
                  </EmptyMedia>
                  <EmptyTitle>{t(normalizedFilter.length == 0 ? 'resource.noProjects' : 'resource.noMatchingProjects')}</EmptyTitle>
                  <EmptyDescription>{t(normalizedFilter.length == 0 ? 'resource.noProjectsDescription' : 'resource.noMatchingDescription')}</EmptyDescription>
                </EmptyHeader>
                {normalizedFilter.length == 0 && (
                  <EmptyContent>
                    <Button onClick={() => setCreating(true)} variant="outline">
                      <Icon data-icon="inline-start" name="plus" size={15} /> {t('resource.newProject')}
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            ) : (
              visibleProjects.map((project) => <ProjectItem busy={busy} key={project.projectId} onSelect={onSelectProject} project={project} store={store} />)
            )}
          </div>
          {nextCursor != null && (
            <Button className="mt-3 w-full" disabled={loadingMore} onClick={() => void store.workspace.loadMoreProjects()} variant="outline">
              {t(loadingMore ? 'resource.loadingMore' : loadMoreFailed ? 'resource.retryLoadMore' : 'resource.loadMore')}
            </Button>
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
      <Button
        className="resource-list-row flow-columns"
        onClick={() => {
          setMode('idle')
          onSelect(flow)
        }}
        type="button"
        variant="ghost"
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
      </Button>
      {draft != null && (
        <Button
          aria-expanded={mode != 'idle'}
          aria-label={t('sidebar.flowActions', { name: draft.name })}
          aria-pressed={mode != 'idle'}
          className={cn('resource-row-more', mode != 'idle' && 'active')}
          disabled={busy != null}
          onClick={() => setMode(mode == 'idle' ? 'actions' : 'idle')}
          size="icon-sm"
          variant="ghost"
        >
          <Icon name="more" size={16} />
        </Button>
      )}
      {mode == 'actions' && draft != null && (
        <div className="resource-row-actions">
          <Button
            onClick={() => {
              setName(draft.name)
              setMode('rename')
            }}
            size="sm"
            variant="outline"
          >
            {t('common.rename')}
          </Button>
          <Button onClick={() => setMode('delete')} size="sm" variant="destructive">
            {t('common.delete')}
          </Button>
        </div>
      )}
      {mode == 'rename' && draft != null && (
        <form className="resource-row-form" onSubmit={(event) => void rename(event)}>
          <label htmlFor={`rename-flow-${flow.flowId}`}>{t('sidebar.renameFlow', { name: draft.name })}</label>
          <span className="resource-row-field">
            <Input
              autoComplete="off"
              aria-describedby={showNameIssue ? nameMessageId : undefined}
              aria-invalid={showNameIssue}
              autoFocus
              id={`rename-flow-${flow.flowId}`}
              name="flow-name"
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
            <Button onClick={() => setMode('idle')} size="sm" variant="outline">
              {t('common.cancel')}
            </Button>
            <Button disabled={busy != null || nameIssue != null} size="sm" type="submit">
              {t('common.save')}
            </Button>
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
            <Button onClick={() => setMode('idle')} size="sm" variant="outline">
              {t('common.cancel')}
            </Button>
            <Button disabled={busy != null} onClick={() => void remove()} size="sm" variant="destructive">
              {t(busy == 'resource' ? 'common.deleting' : 'common.delete')}
            </Button>
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
              <Button onClick={onOpenProjects} size="sm" variant="link">
                {t('resource.workflows')}
              </Button>
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
            <div className="resource-list-actions">
              <InputGroup className="w-full sm:w-56">
                <InputGroupAddon>
                  <Icon name="search" size={17} />
                </InputGroupAddon>
                <InputGroupInput
                  autoComplete="off"
                  aria-label={t('resource.searchFlows')}
                  name="flow-search"
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder={t('resource.searchFlows')}
                  value={filter}
                />
              </InputGroup>
              <Button
                aria-label={t('common.refresh')}
                disabled={loading || busy != null}
                onClick={() => void store.workspace.refreshFlows()}
                size="icon"
                title={t('common.refresh')}
                variant="outline"
              >
                <Icon name="refresh" size={16} />
              </Button>
              <Button disabled={busy != null || draft == null || project?.status == 'retiring'} onClick={() => setCreating(true)}>
                <Icon data-icon="inline-start" name="plus" size={15} />
                {t('resource.newFlow')}
              </Button>
            </div>
          </div>
          <div aria-hidden="true" className="resource-list-columns flow-columns">
            <span>{t('resource.name')}</span>
            <span>{t('resource.changes')}</span>
            <span>{t('resource.status')}</span>
          </div>
          <div className="resource-list">
            {loading ? (
              Array.from({ length: 5 }, (_, index) => <Skeleton className="h-14 rounded-none" key={index} />)
            ) : loadFailed ? (
              <Empty className="min-h-64 border-0" role="alert">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon name="alert" size={20} />
                  </EmptyMedia>
                  <EmptyTitle>{t('resource.flowsLoadFailed')}</EmptyTitle>
                  <EmptyDescription>{t('resource.flowsLoadFailedDescription')}</EmptyDescription>
                </EmptyHeader>
                {projectId != null && (
                  <EmptyContent>
                    <Button onClick={() => void store.selectProject(projectId)} variant="outline">
                      {t('empty.retry')}
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
            ) : visibleFlows.length == 0 ? (
              <Empty className="min-h-64 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Icon name="flow" size={20} />
                  </EmptyMedia>
                  <EmptyTitle>{t(normalizedFilter.length == 0 ? 'resource.noFlows' : 'resource.noMatchingFlows')}</EmptyTitle>
                  <EmptyDescription>{t(normalizedFilter.length == 0 ? 'resource.noFlowsDescription' : 'resource.noMatchingDescription')}</EmptyDescription>
                </EmptyHeader>
                {normalizedFilter.length == 0 && draft != null && (
                  <EmptyContent>
                    <Button onClick={() => setCreating(true)} variant="outline">
                      <Icon data-icon="inline-start" name="plus" size={15} /> {t('resource.newFlow')}
                    </Button>
                  </EmptyContent>
                )}
              </Empty>
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
