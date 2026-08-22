import type { Extension } from '@codemirror/state'
import type { EditorView as CodeMirrorEditorView } from '@codemirror/view'
import type { ReadonlyVal } from 'value-enhancer'
import type {
  ContentSizeChangedEvent,
  EditorDisposable,
  StringEditor,
  StringEditorControl,
  StringEditorModel,
  StringEditorOptions,
} from '../../base/browser/stringEditor.ts'
import type { StringEditorFactory } from '../../designer/browser/textareaStringEditor.ts'

export type CodeMirrorLanguage = 'javascript' | 'json' | 'markdown' | 'plaintext' | 'typescript' | 'yaml'

interface CodeMirrorModules {
  readonly Compartment: typeof import('@codemirror/state').Compartment
  readonly EditorState: typeof import('@codemirror/state').EditorState
  readonly EditorView: typeof import('@codemirror/view').EditorView
  readonly HighlightStyle: typeof import('@codemirror/language').HighlightStyle
  readonly basicSetup: typeof import('codemirror').basicSetup
  readonly javascript: typeof import('@codemirror/lang-javascript').javascript
  readonly json: typeof import('@codemirror/lang-json').json
  readonly markdown: typeof import('@codemirror/lang-markdown').markdown
  readonly syntaxHighlighting: typeof import('@codemirror/language').syntaxHighlighting
  readonly tags: typeof import('@lezer/highlight').tags
  readonly yaml: typeof import('@codemirror/lang-yaml').yaml
}

interface CodeMirrorStringEditorFactoryOptions {
  readonly darkMode$?: ReadonlyVal<boolean>
  readonly theme?: Extension
}

type Listener<T> = (event: T) => void

let codeMirrorModulesPromise: Promise<CodeMirrorModules> | undefined

export function canonicalizeCodeMirrorLanguage(language: string): CodeMirrorLanguage {
  switch (language.trim().toLowerCase()) {
    case 'application/javascript':
    case 'javascript':
    case 'js':
    case 'jsx':
    case 'text/javascript':
      return 'javascript'
    case 'application/json':
    case 'json':
      return 'json'
    case 'markdown':
    case 'md':
    case 'mdx':
    case 'text/markdown':
      return 'markdown'
    case 'application/typescript':
    case 'text/typescript':
    case 'ts':
    case 'tsx':
    case 'typescript':
      return 'typescript'
    case 'application/x-yaml':
    case 'application/yaml':
    case 'text/x-yaml':
    case 'text/yaml':
    case 'yaml':
    case 'yml':
      return 'yaml'
    default:
      return 'plaintext'
  }
}

async function loadCodeMirrorModules(): Promise<CodeMirrorModules> {
  if (codeMirrorModulesPromise == null) {
    codeMirrorModulesPromise = Promise.all([
      import('codemirror'),
      import('@codemirror/state'),
      import('@codemirror/view'),
      import('@codemirror/language'),
      import('@codemirror/lang-javascript'),
      import('@codemirror/lang-json'),
      import('@codemirror/lang-markdown'),
      import('@codemirror/lang-yaml'),
      import('@lezer/highlight'),
    ]).then(([codeMirror, state, view, language, javascript, json, markdown, yaml, highlight]) => ({
      basicSetup: codeMirror.basicSetup,
      Compartment: state.Compartment,
      EditorState: state.EditorState,
      EditorView: view.EditorView,
      HighlightStyle: language.HighlightStyle,
      javascript: javascript.javascript,
      json: json.json,
      markdown: markdown.markdown,
      syntaxHighlighting: language.syntaxHighlighting,
      tags: highlight.tags,
      yaml: yaml.yaml,
    }))
  }
  return codeMirrorModulesPromise
}

function createLanguageExtension(modules: CodeMirrorModules, language: CodeMirrorLanguage): Extension {
  switch (language) {
    case 'javascript':
      return modules.javascript({ jsx: true })
    case 'json':
      return modules.json()
    case 'markdown':
      return modules.markdown()
    case 'typescript':
      return modules.javascript({ jsx: true, typescript: true })
    case 'yaml':
      return modules.yaml()
    case 'plaintext':
      return []
  }
}

function createEditorTheme(modules: CodeMirrorModules, dark: boolean): Extension {
  const tags = modules.tags
  const highlightStyle = modules.HighlightStyle.define([
    { tag: tags.comment, color: 'var(--open-flow-editor-comment, #6a9955)' },
    { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: 'var(--vscode-debugTokenExpression-name, #9b46b0)' },
    { tag: [tags.typeName, tags.className, tags.namespace], color: 'var(--open-flow-editor-type, #4ec9b0)' },
    { tag: [tags.string, tags.character, tags.attributeValue, tags.regexp], color: 'var(--vscode-debugTokenExpression-string, #a31515)' },
    { tag: tags.bool, color: 'var(--vscode-debugTokenExpression-boolean, #0000ff)' },
    { tag: tags.number, color: 'var(--vscode-debugTokenExpression-number, #098658)' },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--open-flow-editor-function, #dcdcaa)' },
    { tag: [tags.variableName, tags.propertyName, tags.attributeName], color: 'var(--open-flow-editor-variable, #9cdcfe)' },
    { tag: tags.punctuation, color: 'var(--vscode-editor-foreground, currentColor)' },
    { tag: [tags.heading, tags.strong], fontWeight: 'bold' },
    { tag: tags.emphasis, fontStyle: 'italic' },
    { tag: [tags.link, tags.url], color: 'var(--vscode-textLink-foreground, LinkText)', textDecoration: 'underline' },
    { tag: tags.invalid, color: 'var(--vscode-debugTokenExpression-error, #e51400)' },
  ])
  return [
    modules.EditorView.theme(
      {
        '&': {
          width: '100%',
          height: '100%',
          color: 'var(--vscode-editor-foreground, CanvasText)',
          backgroundColor: 'var(--vscode-editor-background, Canvas)',
        },
        '&.cm-focused': {
          outline: 'none',
        },
        '.cm-scroller': {
          overflow: 'auto',
          fontFamily: 'var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Consolas, monospace)',
        },
        '.cm-content': {
          caretColor: 'var(--vscode-editorCursor-foreground, currentColor)',
        },
        '.cm-line': {
          padding: '0 8px',
        },
        '.cm-gutters': {
          color: 'var(--vscode-editorLineNumber-foreground, GrayText)',
          backgroundColor: 'var(--vscode-editorGutter-background, var(--vscode-editor-background, Canvas))',
          border: 'none',
        },
        '.cm-activeLineGutter': {
          color: 'var(--vscode-editorLineNumber-activeForeground, currentColor)',
          backgroundColor: 'transparent',
        },
        '.cm-activeLine': {
          backgroundColor: 'var(--vscode-editor-lineHighlightBackground, transparent)',
          outline: '1px solid var(--vscode-editor-lineHighlightBorder, transparent)',
          outlineOffset: '-1px',
        },
        '&.cm-focused .cm-cursor': {
          borderLeftColor: 'var(--vscode-editorCursor-foreground, currentColor)',
        },
        '.cm-selectionBackground': {
          backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground, Highlight)',
        },
        '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-content ::selection': {
          backgroundColor: 'var(--vscode-editor-selectionBackground, Highlight)',
        },
        '.cm-tooltip': {
          color: 'var(--vscode-editorWidget-foreground, CanvasText)',
          backgroundColor: 'var(--vscode-editorWidget-background, Canvas)',
          borderColor: 'var(--vscode-editorWidget-border, GrayText)',
        },
      },
      { dark },
    ),
    modules.syntaxHighlighting(highlightStyle),
  ]
}

function isWordWrapEnabled(wordWrap: string): boolean {
  return wordWrap != 'off'
}

class CallbackDisposable implements EditorDisposable {
  private disposed: boolean = false

  public constructor(private readonly callback: () => void) {}

  public dispose(): void {
    if (!this.disposed) {
      this.disposed = true
      this.callback()
    }
  }
}

class CodeMirrorStringEditorModel implements StringEditorModel {
  public constructor(private readonly control: CodeMirrorStringEditorControl) {}

  public setLanguage(language: string): void {
    this.control.setLanguage(language)
  }
}

class CodeMirrorStringEditorControl implements StringEditorControl {
  private readonly blurListeners = new Set<Listener<void>>()
  private readonly changeListeners = new Set<Listener<void>>()
  private readonly contentSizeListeners = new Set<Listener<ContentSizeChangedEvent>>()
  private readonly editableCompartment: import('@codemirror/state').Compartment
  private readonly focusListeners = new Set<Listener<void>>()
  private readonly languageCompartment: import('@codemirror/state').Compartment
  private readonly model: CodeMirrorStringEditorModel
  private readonly readOnlyCompartment: import('@codemirror/state').Compartment
  private readonly resizeObserver: ResizeObserver | undefined
  private readonly themeCompartment: import('@codemirror/state').Compartment
  private readonly themeReactionDisposer: (() => void) | undefined
  private readonly view: CodeMirrorEditorView
  private readonly wrappingCompartment: import('@codemirror/state').Compartment
  private automaticLayout: boolean
  private disposed: boolean = false
  private domReadOnly: boolean
  private focused: boolean = false
  private language: CodeMirrorLanguage
  private lastContentHeight: number
  private readOnly: boolean
  private wordWrap: string

  public constructor(
    private readonly layoutRoot: HTMLElement,
    uri: string,
    options: StringEditorOptions,
    private readonly modules: CodeMirrorModules,
    darkMode$: ReadonlyVal<boolean> | undefined,
    theme: Extension | undefined,
  ) {
    this.automaticLayout = options.automaticLayout === true
    this.domReadOnly = options.domReadOnly === true
    this.language = canonicalizeCodeMirrorLanguage(options.language ?? 'plaintext')
    this.readOnly = options.readOnly === true
    this.wordWrap = options.wordWrap ?? 'off'
    this.editableCompartment = new modules.Compartment()
    this.languageCompartment = new modules.Compartment()
    this.readOnlyCompartment = new modules.Compartment()
    this.themeCompartment = new modules.Compartment()
    this.wrappingCompartment = new modules.Compartment()
    const dark = darkMode$?.value ?? layoutRoot.closest('.open-flow-theme-dark') != null
    this.view = new modules.EditorView({
      doc: options.value ?? '',
      parent: layoutRoot,
      extensions: [
        modules.basicSetup,
        this.themeCompartment.of(theme ?? createEditorTheme(modules, dark)),
        this.languageCompartment.of(createLanguageExtension(modules, this.language)),
        this.readOnlyCompartment.of(modules.EditorState.readOnly.of(this.readOnly)),
        this.editableCompartment.of(modules.EditorView.editable.of(!this.readOnly && !this.domReadOnly)),
        this.wrappingCompartment.of(isWordWrapEnabled(this.wordWrap) ? modules.EditorView.lineWrapping : []),
        modules.EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.emit(this.changeListeners, undefined)
            this.requestContentMeasure()
          }
        }),
      ],
    })
    this.view.dom.dataset.uri = uri
    this.view.dom.dataset.language = this.language
    if (options.ariaLabel != null) this.view.contentDOM.ariaLabel = options.ariaLabel
    this.model = new CodeMirrorStringEditorModel(this)
    this.focused = this.view.hasFocus
    this.lastContentHeight = this.getContentHeight()
    this.view.dom.addEventListener('focusin', this.onFocusIn)
    this.view.dom.addEventListener('focusout', this.onFocusOut)
    this.themeReactionDisposer =
      theme == null
        ? darkMode$?.reaction((nextDark) => this.view.dispatch({ effects: this.themeCompartment.reconfigure(createEditorTheme(this.modules, nextDark)) }), true)
        : undefined

    const ResizeObserverConstructor = layoutRoot.ownerDocument.defaultView?.ResizeObserver ?? globalThis.ResizeObserver
    if (ResizeObserverConstructor != null) {
      this.resizeObserver = new ResizeObserverConstructor(() => this.requestContentMeasure())
      this.resizeObserver.observe(this.view.contentDOM)
      if (this.automaticLayout) this.resizeObserver.observe(this.layoutRoot)
    }
  }

  public getContentHeight(): number {
    return Math.max(this.view.contentHeight, this.view.contentDOM.scrollHeight)
  }

  public focus(): void {
    if (!this.disposed) this.view.focus()
  }

  public revealPosition(line: number, column: number): void {
    if (this.disposed) return
    const document = this.view.state.doc
    const targetLine = document.line(Math.min(Math.max(line, 1), document.lines))
    const anchor = Math.min(targetLine.from + Math.max(column, 0), targetLine.to)
    this.view.dispatch({
      effects: this.modules.EditorView.scrollIntoView(anchor, { y: 'center' }),
      selection: { anchor },
    })
    this.focus()
  }

  public getDomNode(): HTMLElement | null {
    return this.disposed ? null : this.view.dom
  }

  public getModel(): StringEditorModel | null {
    return this.disposed ? null : this.model
  }

  public getValue(): string {
    return this.view.state.doc.toString()
  }

  public hasWidgetFocus(): boolean {
    return !this.disposed && this.view.hasFocus
  }

  public onDidBlurEditorWidget(listener: () => void): EditorDisposable {
    return this.addListener(this.blurListeners, listener)
  }

  public onDidChangeModelContent(listener: () => void): EditorDisposable {
    return this.addListener(this.changeListeners, listener)
  }

  public onDidContentSizeChange(listener: Listener<ContentSizeChangedEvent>): EditorDisposable {
    return this.addListener(this.contentSizeListeners, listener)
  }

  public onDidFocusEditorWidget(listener: () => void): EditorDisposable {
    return this.addListener(this.focusListeners, listener)
  }

  public setValue(value: string): void {
    if (value != this.getValue()) {
      this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: value } })
    }
  }

  public updateOptions(options: StringEditorOptions): void {
    if (options.ariaLabel != null) this.view.contentDOM.ariaLabel = options.ariaLabel
    if (options.language != null) this.setLanguage(options.language)

    if (options.readOnly != null || options.domReadOnly != null) {
      if (options.readOnly != null) this.readOnly = options.readOnly
      if (options.domReadOnly != null) this.domReadOnly = options.domReadOnly
      this.view.dispatch({
        effects: [
          this.readOnlyCompartment.reconfigure(this.modules.EditorState.readOnly.of(this.readOnly)),
          this.editableCompartment.reconfigure(this.modules.EditorView.editable.of(!this.readOnly && !this.domReadOnly)),
        ],
      })
    }

    if (options.wordWrap != null && options.wordWrap != this.wordWrap) {
      this.wordWrap = options.wordWrap
      this.view.dispatch({ effects: this.wrappingCompartment.reconfigure(isWordWrapEnabled(this.wordWrap) ? this.modules.EditorView.lineWrapping : []) })
      this.requestContentMeasure()
    }

    if (options.automaticLayout != null && options.automaticLayout != this.automaticLayout) {
      this.automaticLayout = options.automaticLayout
      if (this.automaticLayout) {
        this.resizeObserver?.observe(this.layoutRoot)
      } else {
        this.resizeObserver?.unobserve(this.layoutRoot)
      }
      this.view.requestMeasure()
    }
  }

  public setLanguage(language: string): void {
    const canonicalLanguage = canonicalizeCodeMirrorLanguage(language)
    if (canonicalLanguage != this.language) {
      this.language = canonicalLanguage
      this.view.dom.dataset.language = canonicalLanguage
      this.view.dispatch({ effects: this.languageCompartment.reconfigure(createLanguageExtension(this.modules, canonicalLanguage)) })
    }
  }

  public dispose(): void {
    if (!this.disposed) {
      this.disposed = true
      this.themeReactionDisposer?.()
      this.resizeObserver?.disconnect()
      this.view.dom.removeEventListener('focusin', this.onFocusIn)
      this.view.dom.removeEventListener('focusout', this.onFocusOut)
      this.blurListeners.clear()
      this.changeListeners.clear()
      this.contentSizeListeners.clear()
      this.focusListeners.clear()
      this.view.destroy()
    }
  }

  private readonly onFocusIn = (): void => {
    if (!this.focused) {
      this.focused = true
      this.emit(this.focusListeners, undefined)
    }
  }

  private readonly onFocusOut = (): void => {
    queueMicrotask(() => {
      if (!this.disposed && this.focused && !this.view.hasFocus) {
        this.focused = false
        this.emit(this.blurListeners, undefined)
      }
    })
  }

  private addListener<T>(listeners: Set<Listener<T>>, listener: Listener<T>): EditorDisposable {
    listeners.add(listener)
    return new CallbackDisposable(() => listeners.delete(listener))
  }

  private emit<T>(listeners: Set<Listener<T>>, event: T): void {
    for (const listener of listeners) listener(event)
  }

  private requestContentMeasure(): void {
    if (this.disposed) return
    this.view.requestMeasure({
      read: (view) => Math.max(view.contentHeight, view.contentDOM.scrollHeight),
      write: (contentHeight) => {
        if (!this.disposed && contentHeight != this.lastContentHeight) {
          this.lastContentHeight = contentHeight
          this.emit(this.contentSizeListeners, { contentHeight })
        }
      },
    })
  }
}

class CodeMirrorStringEditor implements StringEditor {
  public readonly monacoEditor: CodeMirrorStringEditorControl

  public constructor(control: CodeMirrorStringEditorControl) {
    this.monacoEditor = control
  }

  public focus(): void {
    this.monacoEditor.focus()
  }

  public revealPosition(line: number, column: number): void {
    this.monacoEditor.revealPosition(line, column)
  }

  public dispose(): void {
    this.monacoEditor.dispose()
  }
}

export class CodeMirrorStringEditorFactory implements StringEditorFactory {
  private readonly darkMode$: ReadonlyVal<boolean> | undefined
  private readonly theme: Extension | undefined

  public constructor(options: CodeMirrorStringEditorFactoryOptions = {}) {
    this.darkMode$ = options.darkMode$
    this.theme = options.theme
  }

  public async create(dom: HTMLElement, uri: string, options: StringEditorOptions = {}): Promise<StringEditor> {
    if (typeof document == 'undefined') throw new Error('The CodeMirror string editor requires a DOM environment.')

    const modules = await loadCodeMirrorModules()
    return new CodeMirrorStringEditor(new CodeMirrorStringEditorControl(dom, uri, options, modules, this.darkMode$, this.theme))
  }
}
