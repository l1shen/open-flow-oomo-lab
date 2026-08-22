import type { KeyboardEvent, ReactElement } from 'react'
import type { TFunction } from 'val-i18n'
import type { DiagnosticItem, DiagnosticScope } from '../designer/diagnostics.ts'

import { useEffect, useRef } from 'react'
import { useTranslate } from 'val-i18n-react'
import { Icon } from '../icons.tsx'

interface Props {
  readonly checked: boolean
  readonly checking: boolean
  readonly items: readonly DiagnosticItem[]
  readonly onClose: () => void
  readonly onRefresh: () => void
  readonly onSelect: (item: DiagnosticItem) => void
}

function scopeLabel(scope: DiagnosticScope, t: TFunction): string {
  return t(`diagnostics.scope.${scope}`)
}

export function DiagnosticsPanel({ checked, checking, items, onClose, onRefresh, onSelect }: Props): ReactElement {
  const t = useTranslate()
  const panel = useRef<HTMLElement>(null)

  useEffect(() => panel.current?.focus({ preventScroll: true }), [])

  function keyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key != 'Escape') return
    event.stopPropagation()
    onClose()
  }

  return (
    <aside aria-labelledby="diagnostics-title" className="diagnostics-panel" id="diagnostics-panel" onKeyDown={keyDown} ref={panel} role="dialog" tabIndex={-1}>
      <header>
        <div>
          <strong id="diagnostics-title">{t('diagnostics.title')}</strong>
          <span>{checking ? t('diagnostics.checking') : checked ? t('diagnostics.summary', { count: items.length }) : t('diagnostics.notChecked')}</span>
        </div>
        <div className="diagnostics-panel-actions">
          <button className="button secondary small" disabled={checking} onClick={onRefresh} type="button">
            {t('diagnostics.refresh')}
          </button>
          <button aria-label={t('diagnostics.close')} className="icon-button" onClick={onClose} type="button">
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>
      {items.length == 0 ? (
        checking ? (
          <div aria-label={t('diagnostics.checking')} className="diagnostics-loading">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <div className="diagnostics-empty">
            <span className="empty-icon">
              <Icon name="check" size={20} />
            </span>
            <strong>{t(checked ? 'diagnostics.emptyTitle' : 'diagnostics.notCheckedTitle')}</strong>
            <span>{t(checked ? 'diagnostics.emptyDescription' : 'diagnostics.notCheckedDescription')}</span>
          </div>
        )
      ) : (
        <ol className="diagnostics-list">
          {items.map((item, index) => {
            const content = (
              <>
                <span className="diagnostic-row-heading">
                  <span className="diagnostic-scope">{scopeLabel(item.scope, t)}</span>
                  <code>{item.diagnostic.code}</code>
                  {item.scope == 'code' && <span>{t('diagnostics.sourceLocation', { column: item.diagnostic.column + 1, line: item.diagnostic.line })}</span>}
                </span>
                <strong>{item.diagnostic.message}</strong>
                <code className="diagnostic-path">{item.diagnostic.path}</code>
                <span className="diagnostic-row-action">{t(item.location == null ? 'diagnostics.pathOnly' : 'diagnostics.locate')}</span>
              </>
            )
            return (
              <li key={`${item.diagnostic.path}:${item.diagnostic.line}:${item.diagnostic.column}:${item.diagnostic.code}:${index}`}>
                {item.location == null ? (
                  <div className="diagnostic-row unavailable">{content}</div>
                ) : (
                  <button
                    aria-label={t('diagnostics.locateIssue', { message: item.diagnostic.message })}
                    className="diagnostic-row"
                    onClick={() => onSelect(item)}
                    type="button"
                  >
                    {content}
                  </button>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </aside>
  )
}
