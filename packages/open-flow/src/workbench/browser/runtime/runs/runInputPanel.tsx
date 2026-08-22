import type { FormEvent, KeyboardEvent, ReactElement } from 'react'
import type { RunInputGroup, RunInputRequest, RunRequestStore } from './runRequestStore.ts'

import { useEffect, useRef } from 'react'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { FlowRunInputEditor } from '../../flowRunInputEditor.tsx'
import { Icon } from '../icons.tsx'

interface Props {
  readonly onStarted: () => void
  readonly store: RunRequestStore
}

function InputGroup({ attempted, group }: { readonly attempted: boolean; readonly group: RunInputGroup }): ReactElement {
  const t = useTranslate()
  const valid = useVal(group.editor.valid$)
  return (
    <section className={`run-input-group ${attempted && !valid ? 'invalid' : ''}`}>
      <header>
        <div>
          <strong>{group.title}</strong>
          <code>{group.nodeId}</code>
        </div>
        {attempted && !valid && <span>{t('runInput.groupInvalid')}</span>}
      </header>
      <FlowRunInputEditor store={group.editor} />
    </section>
  )
}

function Panel({ onStarted, request, store }: Props & { readonly request: RunInputRequest }): ReactElement {
  const t = useTranslate()
  const valid = useVal(request.valid)
  const starting = useVal(store.$.starting)
  const panel = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    return () => previousFocus.current?.focus({ preventScroll: true })
  }, [])

  function close(): void {
    if (!starting) store.dismissInputs()
  }

  function keyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key != 'Escape') return
    event.stopPropagation()
    close()
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (await store.confirmInputs()) onStarted()
  }

  return (
    <aside
      aria-describedby="run-input-description"
      aria-labelledby="run-input-title"
      className="run-input-panel"
      id="run-input-panel"
      onKeyDown={keyDown}
      ref={panel}
      role="dialog"
      tabIndex={-1}
    >
      <form onSubmit={(event) => void submit(event)}>
        <header>
          <div>
            <strong id="run-input-title">{t('runInput.title')}</strong>
            <span>
              {request.flow.draft?.name ?? request.flow.flowId} · {t(request.source == 'draft' ? 'run.sourceDraft' : 'run.sourceLive')}
            </span>
          </div>
          <button aria-label={t('runInput.close')} className="icon-button" disabled={starting} onClick={close} type="button">
            <Icon name="close" size={16} />
          </button>
        </header>
        <div className="run-input-content">
          <p id="run-input-description">{t('runInput.description')}</p>
          {request.attempted && !valid && (
            <div className="run-input-error" role="alert">
              <Icon name="alert" size={15} />
              <span>{t('runInput.invalid')}</span>
            </div>
          )}
          {request.groups.map((group) => (
            <InputGroup attempted={request.attempted} group={group} key={group.nodeId} />
          ))}
        </div>
        <footer>
          <button className="button secondary" disabled={starting} onClick={close} type="button">
            {t('common.cancel')}
          </button>
          <button className="button primary" disabled={starting} type="submit">
            <Icon name="play" size={15} />
            {t(starting ? 'workspace.starting' : request.source == 'draft' ? 'workspace.runDraft' : 'workspace.runLive')}
          </button>
        </footer>
      </form>
    </aside>
  )
}

export function RunInputPanel({ onStarted, store }: Props): ReactElement | null {
  const request = useVal(store.$.inputRequest)
  return request == null ? null : <Panel onStarted={onStarted} request={request} store={store} />
}
