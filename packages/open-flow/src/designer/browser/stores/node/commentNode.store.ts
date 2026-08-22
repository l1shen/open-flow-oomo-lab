import type { DisposableStore, Disposer } from '@wopjs/disposable'
import type { XYPosition } from '@xyflow/react'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextStore } from '../../../../localization/common/localization.ts'
import type { NodeId } from '../../../../schema/index.ts'
import type { Size } from '../../base/compare.ts'
import type { RFNode, RFNodeId } from '../../base/rfHelpers.ts'
import type { ToReadonly$Group } from '../../base/val.ts'
import type { DesignerUIStore } from '../designer/designerUI.store.ts'
import type { NodeType } from './constants.ts'

import { disposableStore } from '@wopjs/disposable'
import { attachSetter, compute, derive, setValue, val } from 'value-enhancer'
import { isSameSize } from '../../base/compare.ts'
import { DEFAULT_POSITION, NODE_HANDLE_CLASSNAME } from '../../base/designer.ts'
import { toRFNodeId } from '../../base/rfHelpers.ts'
import { fixTranslateKey, toUserTranslateKey, updatePartial } from '../../base/trivial.ts'
import { getNextLang, getProperLocale$, localize } from '../designer/l10n.ts'
import { NODE_TYPE } from './constants.ts'
import { NodeUIStore } from './nodeUI.store.ts'

const dragHandle = `.${NODE_HANDLE_CLASSNAME}`

export interface CommentNodeStore$$ {
  readonly rfNode: Val<RFNode>
  readonly selected: Val<boolean | undefined>
  readonly position: Val<XYPosition>
  readonly title: Val<string | undefined>
  readonly content: Val<string | undefined>
  readonly sourceCode: Val<boolean>

  // These fields align the NodeStore and CommentNodeStore union.
  readonly showSettings: undefined
}

export interface CommentNodeStore$ extends ToReadonly$Group<CommentNodeStore$$> {
  readonly lang: ReadonlyVal<string>
  readonly preview: ReadonlyVal<React.ReactNode>
  readonly measured: ReadonlyVal<Partial<Size> | undefined>
  // This value is available only when user locales are configured.
  readonly translateKey?: ReadonlyVal<string | undefined>
}

type MountCodeEditorFn = (dom: HTMLDivElement, content$: Val<string | undefined>, lang$: ReadonlyVal<string>, userLocales?: LocaleTextStore) => Disposer | void

export interface CommentNodeStoreProps {
  // Each comment node can select its own display language.
  readonly lang: Val<string>
  readonly userLocales?: LocaleTextStore
  readonly designerUIStore: DesignerUIStore
  readonly duplicateNode?: (offset?: XYPosition | undefined) => void
  // The content can be a `%key%` localization reference.
  readonly mountCodeEditor: MountCodeEditorFn
  readonly remove?: () => void
  readonly preview: ReadonlyVal<React.ReactNode>
}

export class CommentNodeStore {
  public static is(store: unknown): store is CommentNodeStore {
    return store instanceof CommentNodeStore
  }

  public readonly dispose: DisposableStore = disposableStore()

  public readonly nodeType: NodeType = NODE_TYPE.CommentNode
  public readonly nodeId: NodeId

  public readonly rfNodeId: RFNodeId

  public readonly uiStore: NodeUIStore

  public readonly userLocales?: LocaleTextStore
  public readonly $$: CommentNodeStore$$
  public readonly $: CommentNodeStore$
  public readonly duplicateNode: CommentNodeStoreProps['duplicateNode']
  public readonly mountCodeEditor: MountCodeEditorFn
  public readonly remove?: () => void
  public readonly toggleLanguage?: () => void
  public readonly createTranslateKey?: () => void

  // These fields align the NodeStore and CommentNodeStore union.
  public readonly manifest$: undefined
  public readonly display$: undefined
  public readonly execute: undefined

  public constructor(nodeId: NodeId, { designerUIStore, ...props }: CommentNodeStoreProps) {
    this.nodeId = nodeId
    this.rfNodeId = toRFNodeId(nodeId, this.nodeType)
    this.duplicateNode = props.duplicateNode
    this.mountCodeEditor = props.mountCodeEditor
    this.remove = props.remove
    this.userLocales = props.userLocales

    this.uiStore = this.dispose.add(new NodeUIStore(val(), designerUIStore.takeCommentNodeUIData(this.nodeId)))

    const rfNodeData = Object.freeze({ store: this })
    const ensureRFNode = (rfNode: Partial<RFNode> = {}): RFNode => {
      rfNode.id = this.rfNodeId
      rfNode.type = this.nodeType
      rfNode.position = rfNode.position ?? DEFAULT_POSITION
      rfNode.dragHandle = dragHandle
      rfNode.data = rfNodeData
      return rfNode as RFNode
    }

    const rfNode$ = this.dispose.add(attachSetter(derive(this.uiStore.$.rfNode, ensureRFNode), this.uiStore.$$.rfNode.set))

    const selected$ = this.dispose.add(
      attachSetter(
        derive(rfNode$, (rfNode) => rfNode.selected),
        updatePartial(rfNode$, 'selected'),
      ),
    )

    const measured$ = this.dispose.add(derive(rfNode$, (rfNode) => rfNode.measured, { equal: isSameSize }))

    this.$$ = {
      rfNode: rfNode$,
      selected: selected$,
      position: this.uiStore.position$,
      title: this.uiStore.$$.title,
      content: this.uiStore.$$.content,
      sourceCode: val(false),
      showSettings: void 0,
    }

    this.$ = {
      ...this.$$,
      title: this.dispose.add(
        compute((get) => {
          const raw = get(this.$$.title)
          const translateKey = toUserTranslateKey(raw)
          if (translateKey != null && props.userLocales) {
            return localize(props.userLocales, props.lang, get, translateKey, raw)
          }
          return raw
        }),
      ),
      content: this.dispose.add(
        compute((get) => {
          const raw = get(this.$$.content)
          const translateKey = toUserTranslateKey(raw)
          if (translateKey != null && props.userLocales) {
            // "": Do not show '%key%' when content is empty.
            return localize(props.userLocales, props.lang, get, translateKey, '')
          }
          return raw
        }),
      ),
      preview: props.preview,
      measured: measured$,
      lang: this.dispose.add(props.lang.ref()),
      translateKey: props.userLocales ? this.dispose.add(derive(this.$$.content, toUserTranslateKey)) : void 0,
    }

    if (props.userLocales) {
      this.toggleLanguage = () => {
        // Switching languages requires remounting the editor.
        const wasShowingCode = this.$.sourceCode.value
        this.$$.sourceCode.set(false)

        setValue(props.lang, getNextLang(props.lang.value))

        if (wasShowingCode) {
          setTimeout(() => this.$$.sourceCode.set(true), 0)
        }
      }

      this.createTranslateKey = () => {
        const raw = this.$$.content.value || ''
        let key = toUserTranslateKey(raw)
        if (key != null) {
          // Localization is already enabled for this content.
          return
        }

        // Changing the localization key requires remounting the editor.
        const wasShowingCode = this.$.sourceCode.value
        this.$$.sourceCode.set(false)

        const userLocales = props.userLocales!
        const locale$ = getProperLocale$(userLocales, props.lang.value, raw)
        key = fixTranslateKey(`comment:${this.nodeId}:content`, locale$.value)
        locale$.set({ ...locale$.value, [key]: raw })
        this.$$.content.set(`%${key}%`)

        if (wasShowingCode) {
          setTimeout(() => this.$$.sourceCode.set(true), 0)
        }
      }
    }
  }

  public readonly togglePreview = (): void => {
    this.$$.sourceCode.set(!this.$.sourceCode.value)
  }
}
