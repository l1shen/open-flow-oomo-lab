import styles from './dateTimePicker.module.scss'
import type { JSX } from 'react/jsx-runtime'

import { DatePicker, TimePicker } from 'antd'
import { clsx } from 'clsx'
import dayjs from 'dayjs'

export interface DateTimePickerProps {
  className?: string
  style?: React.CSSProperties
  showDate?: boolean
  showTime?: boolean
  defaultValue?: Date
  value?: Date
  isClearable?: boolean
  onChange?: (value: Date | null) => void
  disabled?: boolean
  isSuffix?: boolean
}

const allowClear = { clearIcon: <i className="i-codicon:close" /> }

interface SharedPickerProps {
  readonly allowClear: false | typeof allowClear
  readonly className: string
  readonly disabled: boolean | undefined
  readonly placeholder: string
  readonly size: 'small'
  readonly style: React.CSSProperties | undefined
}

export function DateTimePicker(props: DateTimePickerProps): JSX.Element {
  const sharedProps: SharedPickerProps = {
    placeholder: '',
    className: clsx(styles.picker, props.className),
    style: props.style,
    size: 'small',
    allowClear: props.isClearable ? allowClear : false,
    disabled: props.disabled,
  }
  const value = props.value && dayjs(props.value)
  const defaultValue = props.defaultValue && dayjs(props.defaultValue)
  const onChange = (nextValue: dayjs.Dayjs | null) => props.onChange?.(nextValue && nextValue.toDate())

  return (
    <div className={clsx(styles.wrapper, props.isSuffix && styles.isSuffix)}>
      {props.showDate ? (
        <DatePicker
          {...sharedProps}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          showTime={props.showTime}
          classNames={{ popup: { root: styles.popup } }}
        />
      ) : (
        <TimePicker {...sharedProps} value={value} defaultValue={defaultValue} onChange={onChange} classNames={{ popup: { root: styles.popup } }} />
      )}
    </div>
  )
}
