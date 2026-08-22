import type { FormEvent, ReactElement } from 'react'

import { Dialog } from '@base-ui/react/dialog'
import { useEffect, useRef, useState } from 'react'
import { useTranslate } from 'val-i18n-react'
import { resourceNameIssue, resourceNameMaxLength } from '../../../../project/common/change.ts'
import { Icon } from '../icons.tsx'

export default function CreateResourceDialog({
  id,
  issue,
  label,
  name,
  onNameChange,
  onOpenChange,
  onSubmit,
  pending,
  title,
}: {
  readonly id: string
  readonly issue: ReturnType<typeof resourceNameIssue>
  readonly label: string
  readonly name: string
  readonly onNameChange: (name: string) => void
  readonly onOpenChange: (open: boolean) => void
  readonly onSubmit: (event: FormEvent) => void
  readonly pending: boolean
  readonly title: string
}): ReactElement {
  const t = useTranslate()
  const input = useRef<HTMLInputElement>(null)
  const portal = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const showIssue = name.length > 0 && issue != null
  const message = showIssue ? t(`resource.nameIssue.${issue}`, { max: resourceNameMaxLength }) : t('resource.nameHint', { max: resourceNameMaxLength })
  const messageId = `${id}-message`
  useEffect(() => setOpen(true), [])
  return (
    <>
      <div className="resource-dialog-portal" ref={portal} />
      <Dialog.Root
        onOpenChange={setOpen}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen) onOpenChange(false)
        }}
        open={open}
      >
        <Dialog.Portal container={portal}>
          <Dialog.Backdrop className="resource-dialog-backdrop" />
          <Dialog.Popup className="resource-dialog-popup" initialFocus={() => input.current}>
            <form className="resource-dialog-form" onSubmit={onSubmit}>
              <header className="resource-dialog-header">
                <Dialog.Title>{title}</Dialog.Title>
                <Dialog.Close aria-label={t('common.cancel')} className="icon-button" type="button">
                  <Icon name="close" size={16} />
                </Dialog.Close>
              </header>
              <div className="resource-dialog-body">
                <label className="resource-dialog-field">
                  <span>{label}</span>
                  <input
                    aria-describedby={messageId}
                    aria-invalid={showIssue}
                    id={id}
                    onChange={(event) => onNameChange(event.target.value)}
                    ref={input}
                    required
                    value={name}
                  />
                  <small className={`resource-name-message ${showIssue ? 'error' : ''}`} id={messageId}>
                    {message}
                  </small>
                </label>
              </div>
              <footer className="resource-dialog-footer">
                <Dialog.Close className="button secondary" type="button">
                  {t('common.cancel')}
                </Dialog.Close>
                <button className="button primary" disabled={pending || issue != null} type="submit">
                  {t(pending ? 'common.creating' : 'common.create')}
                </button>
              </footer>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
