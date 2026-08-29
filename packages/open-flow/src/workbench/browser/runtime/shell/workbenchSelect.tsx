import type { ReactElement } from 'react'

import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '../../../../ui/browser/select.tsx'
import { cn } from '../../../../ui/browser/utils.ts'

export interface WorkbenchSelectOption {
  readonly disabled?: boolean
  readonly label: string
  readonly value: string
}

export function WorkbenchSelect({
  ariaLabel,
  className,
  disabled = false,
  id,
  onValueChange,
  options,
  portalRoot,
  value,
}: {
  readonly ariaLabel: string
  readonly className?: string | undefined
  readonly disabled?: boolean
  readonly id?: string | undefined
  readonly onValueChange: (value: string) => void
  readonly options: readonly WorkbenchSelectOption[]
  readonly portalRoot: HTMLElement | null
  readonly value: string
}): ReactElement {
  return (
    <Select
      disabled={disabled}
      onValueChange={(next) => {
        if (next != null) onValueChange(next)
      }}
      value={value}
    >
      <SelectTrigger aria-label={ariaLabel} className={cn('min-w-32', className)} id={id}>
        <SelectValue>{options.find((option) => option.value == value)?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} container={portalRoot}>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem disabled={option.disabled} key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}
