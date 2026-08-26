import styles from './BlockQuickPickPanel.module.scss'
import type { DragEventHandler, MouseEventHandler, ReactNode } from 'react'
import type { HandleName } from '../../../schema/index.ts'
import type { IAddNodeMenuItem } from '../stores/designer/designer.store.ts'

import { clsx } from 'clsx'
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslate } from 'val-i18n-react'
import { Button } from '../../../ui/browser/button.tsx'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../../ui/browser/dropdown-menu.tsx'
import { setTriggerType } from '../base/dragNDrop.ts'
import { toTrue } from '../base/trivial.ts'
import { Input } from '../components/input.tsx'
import { OverlayScrollbar } from '../components/overlayScrollbar.tsx'
import { DesignerIcon } from '../icons/DesignerIcon.tsx'
import { iconOfSchema } from '../jsonSchema/preset.ts'
import { useBlockPickerItems } from './blockPicker.ts'
import { defaultNodeIcon, defaultTriggerIcon } from './Nodes/components/constants.ts'
import { useGetStaticPopupContainer } from './ReactFlowContainer/useGetPopupContainer.ts'

export interface BlockQuickPickPanelProps {
  readonly hideDescription?: boolean
  readonly items: IAddNodeMenuItem[]
  readonly onClick?: (item: IAddNodeMenuItem, data?: string, handle?: HandleName) => void
  readonly provideAsyncItems?: (searchTerm: string, signal: AbortSignal) => Promise<IAddNodeMenuItem[] | undefined>
}

export const BlockQuickPickPanel: React.FC<BlockQuickPickPanelProps> = (props) => {
  const t = useTranslate()
  const ref = useRef<HTMLInputElement>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [cursorIndex, setCursorIndex] = useState(0)
  const [openSubmenu, setOpenSubmenu] = useState(-1)
  const { error: asyncError, items: filteredItems, loading, retry } = useBlockPickerItems(props.items, searchTerm, props.provideAsyncItems)

  useEffect(() => {
    setCursorIndex((c) => clampCursorIndex(c, 1, filteredItems))
  }, [filteredItems])

  useEffect(() => {
    setOpenSubmenu(-1)
  }, [cursorIndex])

  const onNavigate = useCallback(
    (_input: HTMLInputElement, direction: -1 | 1) =>
      setCursorIndex((index) => {
        index += direction
        if (index < 0) {
          index += filteredItems.length
        }
        return clampCursorIndex(index, direction, filteredItems)
      }),
    [filteredItems],
  )

  const onReturn = useCallback(
    (_input: HTMLInputElement) => {
      const item = filteredItems[cursorIndex]
      if (item && item.type !== 'divider' && !item.disabled) {
        setOpenSubmenu(cursorIndex)
      }
    },
    [cursorIndex, filteredItems],
  )

  // Restore input focus after the Dropdown auto-focuses its menu.
  const onMenuClose = useCallback(() => {
    setTimeout(() => {
      if (document.activeElement === document.body) {
        ref.current?.focus()
      }
    }, 50)
  }, [])

  return (
    <div className={clsx(styles.container, props.hideDescription && styles.hideDescription, 'oo-designer-quick-pick-panel')}>
      <Input
        ref={ref}
        className={styles.search}
        placeholder={t('contextMenu.search')}
        prefix={
          <span className={styles.searchIcon}>
            <i className="i-codicon:search" />
          </span>
        }
        value={searchTerm}
        onChange={(s) => setSearchTerm(s)}
        autoFocus
        onNavigate={onNavigate}
        returnToCommit={onReturn}
      />
      <OverlayScrollbar className={`${styles.list} nowheel`} tabIndex={-1} onClick={() => ref.current?.focus()}>
        {filteredItems.map((item, index) => (
          <BlockQuickPickPanelItem
            key={item.index}
            item={item}
            selected={index === cursorIndex}
            menuOpen={index === openSubmenu}
            hideDescription={props.hideDescription}
            onClick={(data, handle) => props.onClick?.(item, data, handle)}
            onMenuClose={onMenuClose}
          />
        ))}
        {loading && (
          <div className={styles.loading} role="status">
            <i className="i-codicon:loading oo-designer-spin" />
          </div>
        )}
        {!loading && asyncError && (
          <div className={styles.feedback} role="alert">
            <span>{t('contextMenu.loadFailed')}</span>
            <Button onClick={retry} size="sm" variant="outline">
              {t('contextMenu.retry')}
            </Button>
          </div>
        )}
        {!loading && !asyncError && filteredItems.length == 0 && <div className={styles.feedback}>{t('contextMenu.empty')}</div>}
      </OverlayScrollbar>
    </div>
  )
}

export const BlockPickerRow = forwardRef<
  HTMLDivElement,
  {
    readonly disabled?: boolean
    readonly draggable?: boolean
    readonly hideDescription?: boolean
    readonly item: IAddNodeMenuItem
    readonly onClick?: MouseEventHandler<HTMLDivElement>
    readonly onDragStart?: DragEventHandler<HTMLDivElement>
    readonly selected?: boolean
    readonly trailing?: ReactNode
  }
>(function BlockPickerRow({ disabled, draggable, hideDescription, item, onClick, onDragStart, selected, trailing }, ref) {
  return item.type == 'divider' ? (
    <div className={clsx(styles.item, styles.dividerItem, 'oo-designer-picker-divider')} ref={ref}>
      <span className={styles.divider}>{item.label}</span>
    </div>
  ) : (
    <div
      className={clsx(
        styles.item,
        'oo-designer-picker-item',
        selected && !disabled && styles.selected,
        disabled && styles.disabled,
        hideDescription && styles.hideDescription,
      )}
      draggable={draggable}
      onClick={onClick}
      onDragStart={onDragStart}
      ref={ref}
      title={getItemTitle(item)}
    >
      <span className={clsx(styles.iconSlot, 'oo-designer-picker-icon')}>
        <DesignerIcon
          src={item.icon || getDefaultIcon(item)}
          className={styles.icon}
          fallback={<DesignerIcon src={getDefaultIcon(item)} className={styles.icon} />}
        />
      </span>
      <span className={clsx(styles.label, 'oo-designer-picker-label')}>{item.label}</span>
      {item.description && <span className={clsx(styles.description, 'oo-designer-picker-description')}>{item.description}</span>}
      {trailing}
    </div>
  )
})

interface BlockQuickPickPanelItemProps {
  readonly item: IAddNodeMenuItem
  readonly selected?: boolean
  readonly menuOpen?: boolean
  readonly hideDescription?: boolean
  readonly onClick?: (data?: string, handle?: HandleName) => void
  readonly onMenuClose?: () => void
}

function BlockQuickPickPanelItem(props: BlockQuickPickPanelItemProps) {
  const getContextMenuContainer = useGetStaticPopupContainer()
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const hasMenu = props.item.type !== 'divider' && (!!props.item.choices?.length || (props.item.handles?.length ?? 0) > 1)
  const data = props.item.type === 'divider' ? undefined : props.item.data
  const handle = props.item.type === 'divider' || props.item.choices?.length || props.item.handles?.length != 1 ? undefined : props.item.handles[0]!.name

  useEffect(() => {
    if (props.selected && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest' })
    }
  }, [props.selected])

  useEffect(() => setOpen(!!props.menuOpen), [props.menuOpen])

  if (props.item.type === 'divider') return <BlockPickerRow item={props.item} />

  const row = (
    <BlockPickerRow
      disabled={props.item.disabled}
      draggable={props.item.type === 'trigger' && props.item.data != null && !props.item.disabled}
      hideDescription={props.hideDescription}
      item={props.item}
      onClick={toTrue(!hasMenu && !props.item.disabled) && (() => props.onClick?.(data, handle))}
      onDragStart={(event) => {
        if (props.item.type === 'trigger' && props.item.data) setTriggerType(event.dataTransfer, props.item.data)
      }}
      ref={ref}
      selected={props.selected}
      trailing={hasMenu && <i className="i-codicon:chevron-right" />}
    />
  )

  if (!hasMenu || props.item.disabled) return row

  const container = getContextMenuContainer()
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) props.onMenuClose?.()
      }}
    >
      <DropdownMenuTrigger nativeButton={false} render={row} />
      <DropdownMenuContent
        align="start"
        className={clsx(styles.menu, props.hideDescription && !props.item.choices?.length && styles.hideDescription)}
        container={container}
        side="right"
        sideOffset={0}
      >
        <BlockPickerMenu container={container} item={props.item} onClick={props.onClick} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function getItemTitle(item: IAddNodeMenuItem) {
  let title = item.label
  if (item.type !== 'divider' && item.description) {
    title += `\n${item.description}`
  }
  return title
}

function BlockPickerMenu({
  container,
  item,
  onClick,
}: {
  readonly container: HTMLElement
  readonly item: Exclude<IAddNodeMenuItem, { type: 'divider' }>
  readonly onClick?: (data?: string, handle?: HandleName) => void
}) {
  if (item.choices?.length) {
    return (
      <DropdownMenuGroup>
        {item.choices.map((choice, index) => {
          const handles = choice.handles ?? item.handles
          const label = (
            <div className={styles.handle} title={choice.description == null ? choice.label : `${choice.label}\n${choice.description}`}>
              <span className={styles.handleName}>{choice.label}</span>
              {choice.description && <span className={styles.handleDescription}>{choice.description}</span>}
            </div>
          )

          return handles?.length ? (
            <DropdownMenuSub key={`choice:${index}`}>
              <DropdownMenuSubTrigger>{label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={styles.menu} container={container}>
                <DropdownMenuGroup>
                  <HandleMenuItems handles={handles} onClick={(handle) => onClick?.(choice.data, handle)} />
                </DropdownMenuGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <DropdownMenuItem key={`choice:${index}`} onClick={() => onClick?.(choice.data)}>
              {label}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuGroup>
    )
  }

  return (
    <DropdownMenuGroup>
      <HandleMenuItems handles={item.handles} onClick={(handle) => onClick?.(item.data, handle)} />
    </DropdownMenuGroup>
  )
}

function HandleMenuItems({
  handles,
  onClick,
}: {
  readonly handles: { name: HandleName; json_schema?: unknown; description?: string }[] | undefined
  readonly onClick?: (handle: HandleName) => void
}) {
  return handles?.map((handle, index) => (
    <DropdownMenuItem key={`handle:${index}`} onClick={() => onClick?.(handle.name)}>
      <i className={iconOfSchema(handle.json_schema)} />
      <div className={styles.handle} title={getHandleTitle(handle)}>
        <span className={styles.handleName}>{handle.name}</span>
        <span className={styles.handleDescription}>{handle.description}</span>
      </div>
    </DropdownMenuItem>
  ))
}

function getHandleTitle(handle: { name: HandleName; description?: string }) {
  let title: string = handle.name
  if (handle.description) {
    title += `\n${handle.description}`
  }
  return title
}

function getDefaultIcon(item: IAddNodeMenuItem) {
  const fallback = (item.type === 'trigger' ? defaultTriggerIcon : defaultNodeIcon).replace('i-', ':') + ':'

  if (item.type === 'scriptlet') {
    switch (item.data?.toLowerCase()) {
      case 'typescript':
        return ':carbon:script:'
      case 'javascript':
        return ':carbon:code:'
      default:
        return fallback
    }
  }

  return fallback
}

function clampCursorIndex(index: number, direction: -1 | 1, filteredItems: readonly IAddNodeMenuItem[]) {
  if (filteredItems.length == 0) return 0
  index = ((index % filteredItems.length) + filteredItems.length) % filteredItems.length
  const start = index
  do {
    const item = filteredItems[index]
    if (item.type !== 'divider' && !item.disabled) break
    index = (index + direction + filteredItems.length) % filteredItems.length
  } while (index != start)
  return index
}
