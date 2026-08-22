import styles from './commentNodes.module.scss'
import type { Disposer } from '@wopjs/disposable'
import type { ReactNode } from 'react'
import type { I18n } from 'val-i18n'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { ReactiveMap } from 'value-enhancer/collections'
import type { LocaleTextStore } from '../../../localization/common/localization.ts'
import type { NodeId } from '../../../schema/index.ts'
import type { XYPosition } from '../base/compare.ts'
import type { CreateL10nMarkdownEditorFn } from '../services/designerService.ts'
import type { DesignerStore } from '../stores/designer/designer.store.ts'
import type { DesignerUIStore } from '../stores/designer/designerUI.store.ts'
import type { NodeUIPersistedData } from '../stores/node/nodeUI.store.ts'

import { noop, toTrue } from '@wopjs/cast'
import { send } from '@wopjs/event'
import { I18nProvider } from 'val-i18n-react'
import { subscribe, val } from 'value-enhancer'
import { MarkdownPreview } from '../preview/markdownPreview.tsx'
import { CommentNodeStore } from '../stores/node/commentNode.store.ts'

export function setupCommentNodes(
  i18n: I18n,
  dark$: ReadonlyVal<boolean>,
  designerStore: DesignerStore,
  commentNodes: ReactiveMap<NodeId, CommentNodeStore>,
  mountCodeEditor: CreateL10nMarkdownEditorFn,
): void {
  const readonly = !designerStore.$.editable.value
  const writable = !readonly
  const entries: [NodeId, CommentNodeStore][] = []
  for (const nodeId of designerStore.designerUIStore.getInitialCommentNodeIds()) {
    const widget = createPreviewWidget(i18n, dark$, readonly)
    const commentNode = new CommentNodeStore(nodeId, {
      lang: makeLanguage$(i18n.lang$),
      userLocales: toTrue(writable) && designerStore.userLocales,
      designerUIStore: designerStore.designerUIStore,
      mountCodeEditor,
      preview: widget.preview$,
      duplicateNode:
        toTrue(writable) &&
        ((offset) => {
          setTimeout(() => commentNode.$$.selected.set(false), 0)
          return addCommentNodeStore({
            i18n,
            userLocales: designerStore.userLocales,
            dark$,
            readonly,
            designerUIStore: designerStore.designerUIStore,
            commentNodes,
            mountCodeEditor,
            position: addXYPosition(commentNode.$.position.value, offset),
            nodeUIData: commentNode.uiStore.toUIData(),
            selected: true,
          })
        }),
    })
    widget.onDoubleClick(commentNode.togglePreview)
    commentNode.dispose.add(widget.preview$)
    commentNode.dispose.add(widget.setup(commentNode.$.content))
    entries.push([nodeId, commentNode])
  }
  commentNodes.replace(entries)
}

function makeLanguage$(lang$: ReadonlyVal<string>): Val<string> {
  const language$ = val(lang$.value)
  const dispose = lang$.reaction(language$.set)
  const disposeLanguage$ = language$.dispose
  language$.dispose = () => {
    dispose()
    disposeLanguage$.call(language$)
  }
  return language$
}

function addXYPosition(position: XYPosition, offset: XYPosition = { x: 50, y: 50 }): XYPosition {
  return {
    x: position.x + offset.x,
    y: position.y + offset.y,
  }
}

function updatePosition(nodeUIData: NodeUIPersistedData | undefined, position?: XYPosition, selected?: boolean): NodeUIPersistedData | undefined {
  if (!nodeUIData || !position) return nodeUIData
  return {
    ...nodeUIData,
    rfNode: { ...nodeUIData.rfNode, position, selected: selected ?? false },
  }
}

interface ICommentNodeConfig {
  i18n: I18n
  userLocales?: LocaleTextStore
  dark$: ReadonlyVal<boolean>
  readonly: boolean
  designerUIStore: DesignerUIStore
  commentNodes: ReactiveMap<NodeId, CommentNodeStore>
  mountCodeEditor: CreateL10nMarkdownEditorFn
  position?: XYPosition
  nodeId?: NodeId
  content?: string
  nodeUIData?: NodeUIPersistedData
  selected?: boolean
}

export function addCommentNodeStore({
  i18n,
  userLocales,
  dark$,
  readonly,
  designerUIStore,
  commentNodes,
  mountCodeEditor,
  position,
  nodeId = produceCommentNodeId(commentNodes),
  content,
  nodeUIData,
  selected,
}: ICommentNodeConfig): undefined {
  const writable = !readonly
  const title = produceCommentTitle(commentNodes)

  designerUIStore.setCommentNodeUIData(
    nodeId,
    updatePosition(nodeUIData, position, selected) || {
      contentWidth: 350,
      rfNode: { position, selected },
      title,
      content: content || '',
    },
  )

  const widget = createPreviewWidget(i18n, dark$, readonly)
  const commentNode = new CommentNodeStore(nodeId, {
    lang: makeLanguage$(i18n.lang$),
    userLocales: toTrue(writable) && userLocales,
    designerUIStore,
    mountCodeEditor,
    preview: widget.preview$,
    duplicateNode:
      toTrue(writable) &&
      ((offset) => {
        setTimeout(() => commentNode.$$.selected.set(false), 0)
        return addCommentNodeStore({
          i18n,
          userLocales,
          dark$,
          readonly,
          designerUIStore,
          commentNodes,
          mountCodeEditor,
          position: addXYPosition(commentNode.$.position.value, offset),
          nodeUIData: commentNode.uiStore.toUIData(),
          selected: true,
        })
      }),
  })
  widget.onDoubleClick(commentNode.togglePreview)
  commentNode.dispose.add(widget.preview$)
  commentNode.dispose.add(widget.setup(commentNode.$.content))
  commentNodes.set(nodeId, commentNode)
  send(designerUIStore.onChanged, designerUIStore)
}

interface IMarkdownPreview {
  readonly preview$: ReadonlyVal<ReactNode>
  setup(content$: ReadonlyVal<string | undefined>): Disposer
  onDoubleClick(handler: () => void): void
}

function createPreviewWidget(i18n: I18n, dark$: ReadonlyVal<boolean>, readonly: boolean): IMarkdownPreview {
  const preview$ = val<ReactNode>()

  let doubleClickHandler = noop
  const onDoubleClick = (handler: () => void) => {
    doubleClickHandler = handler
  }

  const setup = (content$: ReadonlyVal<string | undefined>) =>
    subscribe(content$, (content = '') => {
      if (content.trim() === '') {
        preview$.set(
          <I18nProvider i18n={i18n}>
            <div className={styles.emptyContainer}>
              <button className={`${styles.empty} nodrag`} onClick={() => doubleClickHandler()}>
                <span className={styles.emptyIcon}>
                  <i className="i-codicon:go-to-file" />
                </span>
                <span className={styles.emptyText}>{i18n.t('comment.editWithMarkdown')}</span>
              </button>
            </div>
          </I18nProvider>,
        )
        return
      }
      preview$.set(
        <I18nProvider i18n={i18n}>
          <MarkdownPreview
            dark$={dark$}
            content={content}
            className={styles.markdown}
            draggable
            onDoubleClick={() => {
              if (!readonly) doubleClickHandler()
            }}
          />
        </I18nProvider>,
      )
    })

  return { preview$, setup, onDoubleClick }
}

function produceCommentTitle(commentNodes: ReactiveMap<NodeId, CommentNodeStore>): string {
  const regex = /^Comment #(\d+)$/
  let maxId = 0
  for (const comment of commentNodes.values()) {
    const match = comment.$.title.value?.match(regex)
    if (match) {
      const id = parseInt(match[1], 10)
      if (Number.isSafeInteger(id)) {
        maxId = Math.max(maxId, id)
      }
    }
  }
  return `Comment #${maxId + 1}`
}

function produceCommentNodeId(commentNodes: ReactiveMap<NodeId, CommentNodeStore>): NodeId {
  let number = Date.now()
  let commentNodeId = `+comment-${number}` as NodeId
  while (commentNodes.has(commentNodeId)) {
    number += 1
    commentNodeId = `+comment-${number}` as NodeId
  }
  return commentNodeId
}
