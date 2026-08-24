import styles from './select.module.scss'

import { clsx } from 'clsx'
import { useMemo } from 'react'
import { useTranslate } from 'val-i18n-react'
import { Button } from '../../../ui/browser/button.tsx'
import {
  Combobox,
  ComboboxClear,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
} from '../../../ui/browser/combobox.tsx'
import { stopPropagation } from '../base/dom.ts'
import { forwardRef2 } from '../base/react.ts'
import { useGetStaticPopupContainer } from '../graph/ReactFlowContainer/useGetPopupContainer.ts'
import { DesignerIcon } from '../icons/DesignerIcon.tsx'

export interface DesignerOption {
  readonly icon?: string | React.ReactNode
  readonly label?: string
  readonly value?: string
  readonly isDisabled?: boolean
  readonly group?: { label: string; value?: string }
}

export interface DesignerOptionGroup<Option extends DesignerOption = DesignerOption> {
  readonly icon?: string | React.ReactNode
  readonly label?: string
  readonly options: readonly Option[]
  readonly value?: string
}

type DesignerComboboxValue<Option extends DesignerOption, IsMulti extends boolean> = IsMulti extends true ? readonly Option[] : Option | null
type DesignerComboboxDisplayValue<Option extends DesignerOption, IsMulti extends boolean> = IsMulti extends true
  ? readonly Option[]
  : Option | DesignerOption | null

export interface DesignerComboboxProps<
  Option extends DesignerOption = DesignerOption,
  IsMulti extends boolean = false,
  Group extends DesignerOptionGroup<Option> = DesignerOptionGroup<Option>,
> {
  id?: string
  inputId?: string
  className?: string
  placeholder?: string
  disabled?: boolean
  variant?: 'default' | 'danger'
  isMulti?: IsMulti
  isClearable?: boolean
  menuPosition?: 'absolute' | 'fixed'
  menuPlacement?: 'auto' | 'bottom' | 'top'
  defaultOpen?: boolean
  defaultValue?: DesignerComboboxValue<Option, IsMulti>
  value?: DesignerComboboxDisplayValue<Option, IsMulti>
  options?: readonly (Option | Group)[]
  onChange?: (value: DesignerComboboxValue<Option, IsMulti>) => void
  onClose?: () => void
  labelInMenu?: string
  maxMenuHeight?: number
  capitalize?: boolean
  isSuffix?: boolean
}

interface OptionGroup<Option extends DesignerOption> {
  readonly icon?: string | React.ReactNode
  readonly key: string
  readonly label?: string
  readonly options: readonly Option[]
}

function isOptionGroup<Option extends DesignerOption>(option: Option | DesignerOptionGroup<Option>): option is DesignerOptionGroup<Option> {
  return 'options' in option
}

function matchSubstring<Option extends DesignerOption>(option: Option, input: string): boolean {
  input = input.trim().toLowerCase()
  return (
    (option.group?.label || '').toLowerCase().includes(input) ||
    (option.group?.value || '').toLowerCase().includes(input) ||
    (option.label || '').toLowerCase().includes(input) ||
    (option.value || '').toLowerCase().includes(input)
  )
}

function renderIcon(icon: React.ReactNode) {
  if (typeof icon === 'string') {
    return icon.startsWith('i-') ? <i className={icon} /> : <DesignerIcon src={icon} />
  }
  return icon
}

function OptionLabel({ option }: { readonly option: DesignerOption }) {
  return (
    <div className={styles.value} title={option.label || option.value}>
      {option.icon && <span className={styles.icon}>{renderIcon(option.icon)}</span>}
      <span className={styles.label}>{option.label || option.value}</span>
    </div>
  )
}

export const DesignerCombobox: <Option extends DesignerOption = DesignerOption, IsMulti extends boolean = false>(
  props: DesignerComboboxProps<Option, IsMulti> & React.RefAttributes<HTMLInputElement>,
) => React.ReactElement | null = /*#__PURE__*/ forwardRef2(function DesignerCombobox<
  Option extends DesignerOption = DesignerOption,
  IsMulti extends boolean = false,
>(props: DesignerComboboxProps<Option, IsMulti>, ref?: React.ForwardedRef<HTMLInputElement>) {
  const t = useTranslate()
  const getPopupContainer = useGetStaticPopupContainer()
  const popupContainer = typeof document === 'undefined' ? undefined : getPopupContainer()

  const { groups, options } = useMemo(() => {
    const menuGroups: OptionGroup<Option>[] = []
    const ungrouped: Option[] = []
    let flatOptions: Option[] = []

    for (const entry of props.options || []) {
      if (isOptionGroup(entry)) {
        const groupOptions = entry.options.map((option) => ({ ...option, group: { label: entry.label || '', value: entry.value } }))
        menuGroups.push({ icon: entry.icon, key: entry.value || entry.label || `group-${menuGroups.length}`, label: entry.label, options: groupOptions })
        flatOptions = flatOptions.concat(groupOptions)
      } else {
        ungrouped.push(entry)
        flatOptions.push(entry)
      }
    }

    if (ungrouped.length > 0) {
      menuGroups.unshift({ key: '$options', options: ungrouped })
    }

    return { groups: menuGroups, options: flatOptions }
  }, [props.options])

  const selectedCount = Array.isArray(props.value) ? props.value.length : 0
  const selectedLabel = Array.isArray(props.value) && selectedCount === 1 ? props.value[0]?.label || props.value[0]?.value : undefined
  const side = props.menuPlacement === 'top' ? 'top' : 'bottom'

  return (
    <Combobox<Option, IsMulti>
      autoHighlight
      defaultOpen={props.defaultOpen}
      defaultValue={props.defaultValue as never}
      disabled={props.disabled}
      filter={matchSubstring}
      id={props.id}
      isItemEqualToValue={(left, right) => left.value === right.value}
      itemToStringLabel={(option) => option.label || option.value || ''}
      itemToStringValue={(option) => option.value || option.label || ''}
      items={options}
      multiple={props.isMulti as IsMulti}
      onOpenChange={(open) => !open && props.onClose?.()}
      onValueChange={(value) => props.onChange?.(value as DesignerComboboxValue<Option, IsMulti>)}
      value={props.value as never}
    >
      <div
        className={clsx(
          styles.control,
          props.variant === 'danger' && styles.danger,
          props.capitalize && styles.capitalize,
          props.isSuffix && styles.isSuffix,
          props.className,
        )}
      >
        {props.isMulti && selectedCount > 0 && (
          <span className={styles.multiValue}>{selectedLabel || t('components.numOptions', { count: selectedCount })}</span>
        )}
        <ComboboxInput
          ref={ref}
          className={styles.input}
          disabled={props.disabled}
          id={props.inputId}
          onKeyDown={stopPropagation}
          placeholder={props.placeholder ?? ''}
        />
        {props.isClearable && !props.disabled && (
          <ComboboxClear
            aria-label={t('components.clear')}
            onMouseDown={(event) => event.preventDefault()}
            render={<Button className={styles.clear} size="icon-xs" type="button" variant="ghost" />}
          >
            <i className="i-codicon:close" />
          </ComboboxClear>
        )}
        <i className={styles.indicator + ' i-codicon:chevron-down'} />
      </div>
      <ComboboxContent
        className={styles.menu}
        container={popupContainer}
        side={side}
        sideOffset={0}
        style={{ '--select-menu-height': `${props.maxMenuHeight ?? 190}px` } as React.CSSProperties}
      >
        <ComboboxEmpty className={styles.empty}>{t('components.noMatching')}</ComboboxEmpty>
        <ComboboxList className={styles.list}>
          {groups.map((group) => (
            <ComboboxGroup key={group.key} items={group.options}>
              {group.label && (
                <ComboboxLabel className={styles.groupLabel}>
                  {group.icon && <span className={styles.icon}>{renderIcon(group.icon)}</span>}
                  <span className={styles.label}>{group.label}</span>
                </ComboboxLabel>
              )}
              <ComboboxCollection>
                {(option: Option) => (
                  <ComboboxItem key={option.value || option.label} disabled={option.isDisabled} value={option}>
                    <OptionLabel option={option} />
                  </ComboboxItem>
                )}
              </ComboboxCollection>
            </ComboboxGroup>
          ))}
        </ComboboxList>
        {props.labelInMenu && (
          <div className={styles.labelInMenu} title={props.labelInMenu}>
            {props.labelInMenu}
          </div>
        )}
      </ComboboxContent>
    </Combobox>
  )
})
