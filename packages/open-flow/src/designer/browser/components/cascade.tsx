import styles from './cascade.module.scss'
import type { DesignerOption, DesignerOptionGroup } from './select.tsx'

import { clsx } from 'clsx'
import { useImperativeHandle, useMemo, useRef } from 'react'
import { useTranslate } from 'val-i18n-react'
import { forwardRef2 } from '../base/react.ts'
import { useGetStaticPopupContainer } from '../graph/ReactFlowContainer/useGetPopupContainer.ts'
import { defaultTooltipClassName } from './label.tsx'
import { DesignerCombobox as Select } from './select.tsx'
import { DesignerTooltip } from './tooltip.tsx'

export interface CascadeRef {
  blur: () => void
  focus: () => void
}

export interface BaseCascadeOption {
  readonly children?: readonly BaseCascadeOption[]
  readonly disabled?: boolean
  readonly icon?: string | React.ReactNode
  readonly label?: string
  readonly value?: string
}

export interface CascadeProps<Option extends BaseCascadeOption = BaseCascadeOption> {
  className?: string
  placeholder?: string
  disabled?: boolean
  defaultValue?: string[]
  value?: string[]
  title?: string
  options?: readonly Option[]
  onChange?: (value: string[]) => void
  onClear?: () => void
  isSuffix?: boolean
  loading?: boolean
  warning?: string
  notFoundContent?: React.ReactNode
}

interface CascadeChoice extends DesignerOption {
  readonly path: string[]
}

function toChoices(options: readonly BaseCascadeOption[] | undefined): DesignerOptionGroup<CascadeChoice>[] {
  return (options || []).map((option, index) => ({
    icon: option.icon,
    label: option.label || option.value || `option-${index}`,
    options: (option.children || []).map((child, childIndex) => ({
      isDisabled: option.disabled || child.disabled,
      label: child.label || child.value || `option-${index}-${childIndex}`,
      path: [option.value || '', child.value || ''],
      value: `${option.value || ''}\u0000${child.value || ''}`,
    })),
    value: option.value,
  }))
}

export const Cascade: (props: CascadeProps<BaseCascadeOption> & React.RefAttributes<CascadeRef>) => React.ReactElement | null = /*#__PURE__*/ forwardRef2(
  function Cascade(props: CascadeProps, ref?: React.ForwardedRef<CascadeRef>) {
    const t = useTranslate()
    const getPopupContainer = useGetStaticPopupContainer()
    const inputRef = useRef<HTMLInputElement>(null)
    const choices = useMemo(() => toChoices(props.options), [props.options])
    const findChoice = (path: string[] | undefined) =>
      choices.flatMap((group) => group.options).find((option) => option.path[0] === path?.[0] && option.path[1] === path?.[1])
    const value = findChoice(props.value) ?? null
    const defaultValue = findChoice(props.defaultValue) ?? null

    useImperativeHandle(ref, () => ({ blur: () => inputRef.current?.blur(), focus: () => inputRef.current?.focus() }), [])

    const cascade = (
      <div
        className={clsx(
          styles.wrapper,
          props.loading && styles.loadingState,
          props.isSuffix && styles.isSuffix,
          props.warning && styles.warning,
          props.className,
        )}
      >
        {props.loading && <i aria-label={t('components.loading')} className={clsx(styles.loading, 'i-codicon:loading', 'oo-designer-spin')} />}
        <Select<CascadeChoice>
          ref={inputRef}
          defaultValue={defaultValue}
          disabled={props.disabled}
          isClearable
          onChange={(choice) => {
            if (choice) {
              props.onChange?.(choice.path)
            } else {
              props.onClear?.()
              props.onChange?.([])
            }
          }}
          options={choices}
          placeholder={props.placeholder ?? t('handleEditor.selectSecret')}
          value={value}
        />
        {props.title && <span className={styles.title}>{props.title}</span>}
      </div>
    )

    return props.warning ? (
      <DesignerTooltip className={defaultTooltipClassName} getPopupContainer={getPopupContainer} placement="top" title={props.warning}>
        {cascade}
      </DesignerTooltip>
    ) : (
      cascade
    )
  },
)
