import type { FormEvent, ReactElement } from 'react'

import { useEffect, useRef, useState } from 'react'
import { useTranslate } from 'val-i18n-react'
import { resourceNameIssue, resourceNameMaxLength } from '../../../../project/common/change.ts'
import { Button } from '../../../../ui/browser/button.tsx'
import { Dialog, DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogTitle } from '../../../../ui/browser/dialog.tsx'
import { Input } from '../../../../ui/browser/input.tsx'
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
      <Dialog
        onOpenChange={setOpen}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen) onOpenChange(false)
        }}
        open={open}
      >
        <DialogPortal container={portal}>
          <DialogOverlay className="resource-dialog-backdrop" />
          <DialogContent className="resource-dialog-popup" initialFocus={() => input.current}>
            <form className="resource-dialog-form" onSubmit={onSubmit}>
              <header className="resource-dialog-header">
                <DialogTitle>{title}</DialogTitle>
                <DialogClose aria-label={t('common.cancel')} render={<Button size="icon-sm" variant="ghost" />} type="button">
                  <Icon name="close" size={16} />
                </DialogClose>
              </header>
              <div className="resource-dialog-body">
                <label className="resource-dialog-field">
                  <span>{label}</span>
                  <Input
                    autoComplete="off"
                    aria-describedby={messageId}
                    aria-invalid={showIssue}
                    id={id}
                    name="resource-name"
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
                <DialogClose render={<Button variant="outline" />} type="button">
                  {t('common.cancel')}
                </DialogClose>
                <Button disabled={pending || issue != null} type="submit">
                  {t(pending ? 'common.creating' : 'common.create')}
                </Button>
              </footer>
            </form>
          </DialogContent>
        </DialogPortal>
      </Dialog>
    </>
  )
}
