import styles from './dateTimePicker.module.scss'
import type { JSX } from 'react/jsx-runtime'

import { clsx } from 'clsx'
import { Button } from '../../../ui/browser/button.tsx'
import { Input } from '../../../ui/browser/input.tsx'

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

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatValue(value: Date | undefined, showDate: boolean, showTime: boolean): string {
  if (!value) return ''
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
  const time = `${pad(value.getHours())}:${pad(value.getMinutes())}`
  if (showDate && showTime) return `${date}T${time}`
  return showDate ? date : time
}

function parseValue(value: string, previous: Date | undefined, showDate: boolean, showTime: boolean): Date | null {
  if (!value) return null
  if (showDate && showTime) return new Date(value)
  if (showDate) return new Date(`${value}T00:00`)

  const [hours, minutes] = value.split(':').map(Number)
  const date = previous ? new Date(previous) : new Date()
  date.setHours(hours || 0, minutes || 0, 0, 0)
  return date
}

export function DateTimePicker(props: DateTimePickerProps): JSX.Element {
  const showDate = props.showDate ?? true
  const showTime = props.showTime ?? false
  const type = showDate ? (showTime ? 'datetime-local' : 'date') : 'time'
  const value = formatValue(props.value, showDate, showTime)
  const defaultValue = formatValue(props.defaultValue, showDate, showTime)
  const valueProps = props.value === undefined ? { defaultValue } : { value }

  return (
    <div className={clsx(styles.wrapper, props.isSuffix && styles.isSuffix, props.className)} style={props.style}>
      <Input
        className={styles.input}
        disabled={props.disabled}
        onChange={(event) => props.onChange?.(parseValue(event.target.value, props.value, showDate, showTime))}
        type={type}
        {...valueProps}
      />
      {props.isClearable && value && !props.disabled && (
        <Button aria-label="Clear date and time" className={styles.clear} onClick={() => props.onChange?.(null)} size="icon-xs" type="button" variant="ghost">
          <i className="i-codicon:close" />
        </Button>
      )}
    </div>
  )
}
