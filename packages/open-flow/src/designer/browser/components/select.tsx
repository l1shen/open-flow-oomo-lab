import styles from './select.module.scss'
import type {
  ClearIndicatorProps,
  DropdownIndicatorProps,
  GroupBase,
  GroupProps,
  MenuPlacement,
  MenuPosition,
  MenuProps,
  OnChangeValue,
  OptionsOrGroups,
  Props,
  PropsValue,
  SelectInstance,
  Theme,
  ValueContainerProps,
} from 'react-select'
import type { ReadonlyVal } from 'value-enhancer'

import { Popover } from 'antd'
import { clsx } from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactSelect, { components, defaultTheme } from 'react-select'
import { useVal } from 'use-value-enhancer'
import { useTranslate } from 'val-i18n-react'
import { val } from 'value-enhancer'
import { stopPropagation } from '../base/dom.ts'
import { forwardRef2 } from '../base/react.ts'
import { useGetStaticPopupContainer } from '../graph/ReactFlowContainer/useGetPopupContainer.ts'
import { DesignerIcon } from '../icons/DesignerIcon.tsx'
import { CssWrapper } from './cssWrapper.tsx'

// TypeScript cannot patch "react-select/dist/declarations/src/Select" with bundler module resolution.
// See https://github.com/JedWatson/react-select/issues/5743.
interface ExtraProps {
  readonly labelInMenu?: string
  readonly searching$?: ReadonlyVal<boolean>
}

// See https://github.com/JedWatson/react-select/blob/-/packages/react-select/src/builtins.ts.
export interface IBasicOption {
  readonly icon?: string | React.ReactNode
  readonly label?: string
  readonly value?: string
  readonly isDisabled?: boolean
  // Derived from group label automatically.
  readonly group?: { label: string; value?: string }
}

export interface IBasicGroup<Option extends IBasicOption = IBasicOption> extends GroupBase<Option> {
  readonly value?: string
  readonly icon?: string | React.ReactNode
}

export interface SelectProps<
  Option extends IBasicOption = IBasicOption,
  IsMulti extends boolean = false,
  Group extends IBasicGroup<Option> = IBasicGroup<Option>,
> {
  id?: string
  inputId?: string
  className?: string
  disabled?: boolean
  variant?: 'default' | 'danger'

  isMulti?: IsMulti
  isClearable?: boolean
  menuPosition?: MenuPosition
  menuPlacement?: MenuPlacement
  defaultOpen?: boolean
  defaultValue?: PropsValue<Option>
  value?: PropsValue<Option>
  options?: OptionsOrGroups<Option, Group>
  onChange?: (value: OnChangeValue<Option, IsMulti>) => void
  onClose?: () => void

  // Show text below menu.
  labelInMenu?: string
  // Default to 200px.
  maxMenuHeight?: number
  // Capitalize the label.
  capitalize?: boolean
  // Adds extra padding left.
  isSuffix?: boolean
}

// See https://github.com/JedWatson/react-select/blob/-/storybook/stories/CustomDropdownIndicator.stories.tsx.
function DropdownIndicator<Option extends IBasicOption = IBasicOption, IsMulti extends boolean = false>(props: DropdownIndicatorProps<Option, IsMulti>) {
  return (
    <components.DropdownIndicator {...props}>
      <i className="i-codicon:chevron-down" />
    </components.DropdownIndicator>
  )
}

// See https://github.com/JedWatson/react-select/blob/-/storybook/stories/CustomClearIndicator.stories.tsx.
function ClearIndicator<Option extends IBasicOption = IBasicOption, IsMulti extends boolean = false>(props: ClearIndicatorProps<Option, IsMulti>) {
  return (
    <components.ClearIndicator {...props}>
      <i className="i-codicon:close" />
    </components.ClearIndicator>
  )
}

function Menu<Option extends IBasicOption = IBasicOption>(props: MenuProps<Option>) {
  const selectProps = props.selectProps as ExtraProps
  return (
    <components.Menu {...props} className={clsx(props.className, 'nowheel')}>
      {props.children}
      {selectProps.labelInMenu && (
        <div className={styles.labelInMenu} title={selectProps.labelInMenu}>
          {selectProps.labelInMenu}
        </div>
      )}
    </components.Menu>
  )
}

function ValueContainer<Option extends IBasicOption = IBasicOption>(props: ValueContainerProps<Option>) {
  const t = useTranslate()

  if (props.isMulti && props.getValue().length > 1) {
    const [value, input] = props.children as [value: React.ReactNode[], input: React.ReactNode]
    return (
      <components.ValueContainer {...props}>
        <div className={styles.multiValue}>
          <div className={styles.label}>{t('components.numOptions', { count: value.length })}</div>
        </div>
        {input}
      </components.ValueContainer>
    )
  }

  return <components.ValueContainer {...props}>{props.children}</components.ValueContainer>
}

function Group<Option extends IBasicOption = IBasicOption, IsMulti extends boolean = false, Group extends IBasicGroup<Option> = IBasicGroup<Option>>(
  props: GroupProps<Option, IsMulti, Group>,
) {
  const { searching$ } = props.selectProps as ExtraProps
  const searching = useVal(searching$)
  const getPopupContainer = useGetStaticPopupContainer()

  if (searching) {
    return (
      <div className={props.cx({ group: true }, props.getClassNames('group', props), props.className)} {...props.innerProps}>
        <div className={styles.groupLabel}>
          {props.data.icon && <span className={styles.icon}>{renderIcon(props.data.icon)}</span>}
          <span className={styles.label}>{props.data.label}</span>
        </div>
        <div className={styles.grouped}>{props.children}</div>
      </div>
    )
  }

  return (
    <Popover
      classNames={{ root: styles.menu }}
      trigger={['hover', 'click']}
      mouseEnterDelay={0.1}
      mouseLeaveDelay={0.1}
      align={{ points: ['tl', 'tr'], offset: [-1, 0] }}
      arrow={false}
      destroyOnHidden
      getPopupContainer={getPopupContainer}
      content={<div className={styles.menuBody}>{props.children}</div>}
    >
      <div className={props.cx({ group: true }, props.getClassNames('group', props), props.className, styles.contextMenu)} {...props.innerProps}>
        {props.label}
      </div>
    </Popover>
  )
}

function formatOptionLabel<Option extends IBasicOption = IBasicOption>(option: Option) {
  const { icon, label, value } = option
  return (
    <div className={styles.value} title={label || value}>
      {icon && <span className={styles.icon}>{renderIcon(icon)}</span>}
      <span className={styles.label}>{label || value}</span>
    </div>
  )
}

function formatGroupLabel<Option extends IBasicOption = IBasicOption>(group: IBasicGroup<Option>) {
  const { icon, label } = group
  return (
    <div className={styles.group} title={label}>
      {icon && <span className={styles.icon}>{renderIcon(icon)}</span>}
      <span className={styles.label}>{label}</span>
      <i className="i-codicon:chevron-right" />
    </div>
  )
}

const customTheme: Theme = { ...defaultTheme, spacing: { ...defaultTheme.spacing, controlHeight: 22 } }

const customComponents = { DropdownIndicator, ClearIndicator, Menu, ValueContainer, Group }

const customStyles = { menu: (base: {}) => ({ ...base, width: 'var(--menu-width)' }) }

function renderIcon(icon: React.ReactNode) {
  if (typeof icon === 'string') {
    return icon.startsWith('i-') ? <i className={icon} /> : <DesignerIcon src={icon} />
  }
  return icon
}

interface FilterOptionOption<Option> {
  readonly label: string
  readonly value: string
  readonly data: Option
}

function matchSubstring<Option extends IBasicOption = IBasicOption>(option: FilterOptionOption<Option>, input: string): boolean {
  input = input.trim().toLowerCase()
  return (
    (option.data.group?.label || '').toLowerCase().includes(input) ||
    (option.data.group?.value || '').toLowerCase().includes(input) ||
    (option.label || '').toLowerCase().includes(input) ||
    (option.value || '').toLowerCase().includes(input)
  )
}

export const Select: <Option extends IBasicOption = IBasicOption, IsMulti extends boolean = false>(
  props: SelectProps<Option, IsMulti> & React.RefAttributes<SelectInstance<Option, IsMulti>>,
) => React.ReactElement | null = /*#__PURE__*/ forwardRef2(function Select<Option extends IBasicOption = IBasicOption, IsMulti extends boolean = false>(
  props: SelectProps<Option, IsMulti>,
  ref?: React.Ref<SelectInstance<Option, IsMulti>>,
) {
  const t = useTranslate()
  const [searching$] = useState(() => val(false))

  const innerRef = useRef<SelectInstance<Option, IsMulti>>(null)

  const mergedRef = useCallback(
    (instance: SelectInstance<Option, IsMulti> | null) => {
      type SelectRef = React.MutableRefObject<SelectInstance<Option, IsMulti> | null>
      ;(innerRef as SelectRef).current = instance
      if (typeof ref === 'function') {
        ref(instance)
      } else if (ref) {
        ;(ref as SelectRef).current = instance
      }
    },
    [ref],
  )

  // Add group info to sub-options so that matchSubstring can search them.
  const options = useMemo(() => {
    if (props.options?.some((e) => 'options' in e)) {
      return props.options.map((e) => {
        if ('options' in e) {
          return { ...e, options: e.options.map((o) => ({ ...o, group: { label: e.label, value: e.value } })) }
        }
        return e
      })
    }
    return props.options
  }, [props.options])

  const [menuWidth, setMenuWidth] = useState(0)

  useEffect(() => {
    if (innerRef.current?.controlRef) {
      let timer = 0
      const observer = new ResizeObserver((entries) => {
        const width = entries[0].borderBoxSize[0].inlineSize
        clearTimeout(timer)
        timer = window.setTimeout(() => setMenuWidth(width), 0)
      })
      observer.observe(innerRef.current.controlRef)
      return () => {
        clearTimeout(timer)
        observer.disconnect()
      }
    }
  }, [])

  useEffect(() => {
    if (props.defaultOpen && innerRef.current) {
      innerRef.current.focus()
    }
  }, [props.defaultOpen])

  const css = { '--menu-width': `${menuWidth}px` }

  const ReactSelectEx = ReactSelect as React.FC<Props<Option, IsMulti, IBasicGroup<Option>> & ExtraProps & { ref: React.Ref<SelectInstance<Option, IsMulti>> }>

  return (
    <CssWrapper css={css}>
      <ReactSelectEx
        id={props.id}
        inputId={props.inputId}
        ref={mergedRef}
        defaultValue={props.defaultValue}
        value={props.value}
        options={options}
        onChange={props.onChange}
        onMenuClose={props.onClose}
        isDisabled={props.disabled}
        isMulti={props.isMulti}
        defaultMenuIsOpen={props.defaultOpen}
        isClearable={props.isClearable}
        tabSelectsValue={false}
        closeMenuOnSelect={!props.isMulti}
        blurInputOnSelect={!props.isMulti}
        openMenuOnFocus
        captureMenuScroll
        hideSelectedOptions={false}
        filterOption={matchSubstring}
        menuPosition={props.menuPosition}
        menuPlacement={props.menuPlacement}
        // menuIsOpen // Toggle this line to test menu open styles.
        className={clsx(
          'react-select-container',
          props.variant === 'danger' && styles.danger,
          props.capitalize && styles.capitalize,
          props.isSuffix && styles.isSuffix,
          props.className,
        )}
        classNamePrefix="react-select"
        unstyled
        placeholder={null}
        noOptionsMessage={() => t('components.noMatching')}
        theme={customTheme}
        styles={customStyles}
        components={customComponents}
        labelInMenu={props.labelInMenu}
        maxMenuHeight={props.maxMenuHeight ?? 190}
        formatOptionLabel={formatOptionLabel}
        formatGroupLabel={formatGroupLabel}
        onKeyDown={stopPropagation}
        searching$={searching$}
        onInputChange={(s: string) => searching$.set(!!s)}
      />
    </CssWrapper>
  )
})
