import type { FormEvent, ReactElement } from 'react'

import { useEffect, useRef, useState } from 'react'
import { useTranslate } from 'val-i18n-react'
import { resourceNameIssue, resourceNameMaxLength } from '../../../../flow/common/change.ts'
import { Button } from '../../../../ui/browser/button.tsx'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../../../../ui/browser/dialog.tsx'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '../../../../ui/browser/field.tsx'
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
      <div ref={portal} />
      <Dialog
        onOpenChange={setOpen}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen) onOpenChange(false)
        }}
        open={open}
      >
        <DialogContent container={portal.current} initialFocus={() => input.current} showCloseButton={false}>
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <DialogHeader className="flex-row items-center justify-between">
              <DialogTitle>{title}</DialogTitle>
              <DialogClose aria-label={t('common.cancel')} render={<Button size="icon-sm" variant="ghost" />} type="button">
                <Icon name="close" />
              </DialogClose>
            </DialogHeader>
            <FieldGroup>
              <Field data-invalid={showIssue}>
                <FieldLabel htmlFor={id}>{label}</FieldLabel>
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
                {showIssue ? <FieldError id={messageId}>{message}</FieldError> : <FieldDescription id={messageId}>{message}</FieldDescription>}
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />} type="button">
                {t('common.cancel')}
              </DialogClose>
              <Button disabled={pending || issue != null} type="submit">
                {t(pending ? 'common.creating' : 'common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
