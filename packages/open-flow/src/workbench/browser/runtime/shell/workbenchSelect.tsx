import type { ReactElement } from 'react'

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectList,
  SelectPortal,
  SelectPositioner,
  SelectTrigger,
  SelectValue,
} from '../../../../ui/browser/select.tsx'
import { Icon } from '../icons.tsx'

export interface WorkbenchSelectOption {
  readonly disabled?: boolean
  readonly label: string
  readonly value: string
}

export function WorkbenchSelect({
  ariaLabel,
  disabled = false,
  onValueChange,
  options,
  portalRoot,
  value,
}: {
  readonly ariaLabel: string
  readonly disabled?: boolean
  readonly onValueChange: (value: string) => void
  readonly options: readonly WorkbenchSelectOption[]
  readonly portalRoot: HTMLElement | null
  readonly value: string
}): ReactElement {
  return (
    <Select
      disabled={disabled}
      items={options}
      onValueChange={(next) => {
        if (next != null) onValueChange(next)
      }}
      value={value}
    >
      <SelectTrigger aria-label={ariaLabel} className="workbench-select-trigger">
        <SelectValue className="workbench-select-value" />
        <Icon name="chevron-down" size={15} />
      </SelectTrigger>
      <SelectPortal container={portalRoot}>
        <SelectPositioner align="end" className="workbench-select-positioner" side="bottom" sideOffset={4}>
          <SelectContent className="workbench-select-popup">
            <SelectList className="workbench-select-list">
              <SelectGroup>
                {options.map((option) => (
                  <SelectItem className="workbench-select-item" disabled={option.disabled} key={option.value} value={option.value}>
                    <SelectItemText>{option.label}</SelectItemText>
                    <SelectItemIndicator className="workbench-select-item-indicator">
                      <Icon name="check" size={14} />
                    </SelectItemIndicator>
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectList>
          </SelectContent>
        </SelectPositioner>
      </SelectPortal>
    </Select>
  )
}
