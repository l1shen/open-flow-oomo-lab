import styles from './cascade.module.scss'
import type { DefaultOptionType } from 'antd/es/cascader'

import { LoadingOutlined } from '@ant-design/icons'
import { Cascader, Divider, Tooltip } from 'antd'
import { clsx } from 'clsx'
import { useTranslate } from 'val-i18n-react'
import { forwardRef2 } from '../base/react.ts'
import { defaultTooltipProps } from './label.tsx'

export interface CascadeRef {
  blur: () => void
  focus: () => void
}

export interface BaseCascadeOption extends DefaultOptionType {
  value?: string
}

export interface CascadeProps<Option extends BaseCascadeOption = BaseCascadeOption> {
  className?: string
  placeholder?: string
  disabled?: boolean
  defaultValue?: string[]
  value?: string[]
  title?: string
  options?: Option[]
  onChange?: (value: string[]) => void
  onClear?: () => void
  isSuffix?: boolean
  loading?: boolean
  warning?: string
  notFoundContent?: React.ReactNode
}

const allowClear = { clearIcon: <i className="i-codicon:close" /> }

const showSearch = {
  filter: (inputValue: string, path: BaseCascadeOption[]) => path.some((option) => option.value?.toLowerCase()?.includes(inputValue.toLowerCase())),
  matchInputWidth: true,
}

const suffixIcon = <i className="i-codicon:chevron-down" />

export const Cascade: (props: CascadeProps<BaseCascadeOption> & React.RefAttributes<CascadeRef>) => React.ReactElement | null = /*#__PURE__*/ forwardRef2(
  function Cascade(props: CascadeProps, ref?: React.Ref<CascadeRef>) {
    const t = useTranslate()

    const cascade = (
      <div className={clsx(styles.wrapper, props.isSuffix && styles.isSuffix, props.warning && styles.warning)}>
        <Cascader
          ref={ref}
          size="small"
          className={clsx(styles.cascade, props.className)}
          classNames={{ popup: { root: clsx(styles.popup, 'nowheel') } }}
          allowClear={allowClear}
          showSearch={showSearch}
          suffixIcon={suffixIcon}
          notFoundContent={props.notFoundContent ?? <div className={styles.placeholder}>{t('components.noMatching')}</div>}
          popupRender={
            props.title
              ? (menus: React.ReactNode) => (
                  <>
                    <div className={styles.title}>{props.title}</div>
                    <Divider style={{ margin: 0 }} />
                    {menus}
                  </>
                )
              : undefined
          }
          placeholder={props.placeholder ?? t('handleEditor.selectSecret')}
          defaultValue={props.defaultValue}
          value={props.value}
          options={props.options}
          onChange={props.onChange}
          onClear={props.onClear}
          disabled={props.disabled}
          prefix={props.loading && <LoadingOutlined spin />}
        />
      </div>
    )

    return props.warning ? (
      <Tooltip {...defaultTooltipProps} placement="top" title={props.warning}>
        {cascade}
      </Tooltip>
    ) : (
      cascade
    )
  },
)
