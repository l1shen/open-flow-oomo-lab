import type { EditorDisposable, StringEditor, StringEditorControl, StringEditorModel, StringEditorOptions } from '../../base/browser/stringEditor.ts'

export interface StringEditorFactory {
  create(dom: HTMLElement, uri: string, options?: StringEditorOptions): Promise<StringEditor>
}

class EventListenerDisposable implements EditorDisposable {
  public constructor(
    private readonly target: EventTarget,
    private readonly type: string,
    private readonly listener: EventListener,
  ) {}

  public dispose(): void {
    this.target.removeEventListener(this.type, this.listener)
  }
}

class TextareaStringEditorModel implements StringEditorModel {
  public constructor(private readonly element: HTMLTextAreaElement) {}

  public setLanguage(language: string): void {
    this.element.dataset.language = language
  }
}

class TextareaStringEditorControl implements StringEditorControl {
  private readonly model: TextareaStringEditorModel

  public constructor(private readonly element: HTMLTextAreaElement) {
    this.model = new TextareaStringEditorModel(element)
  }

  public getContentHeight(): number {
    return this.element.scrollHeight
  }

  public getDomNode(): HTMLElement {
    return this.element
  }

  public getModel(): StringEditorModel {
    return this.model
  }

  public getValue(): string {
    return this.element.value
  }

  public hasWidgetFocus(): boolean {
    return document.activeElement === this.element
  }

  public onDidBlurEditorWidget(listener: () => void): EditorDisposable {
    return this.listen('blur', listener)
  }

  public onDidChangeModelContent(listener: () => void): EditorDisposable {
    return this.listen('input', listener)
  }

  public onDidContentSizeChange(listener: (event: { readonly contentHeight: number }) => void): EditorDisposable {
    const onInput = () => listener({ contentHeight: this.getContentHeight() })
    return this.listen('input', onInput)
  }

  public onDidFocusEditorWidget(listener: () => void): EditorDisposable {
    return this.listen('focus', listener)
  }

  public setValue(value: string): void {
    this.element.value = value
    this.element.dispatchEvent(new Event('input'))
  }

  public updateOptions(options: StringEditorOptions): void {
    if (options.ariaLabel != null) this.element.ariaLabel = options.ariaLabel
    if (options.readOnly != null || options.domReadOnly != null) {
      this.element.readOnly = options.readOnly === true || options.domReadOnly === true
    }
    if (options.language != null) this.model.setLanguage(options.language)
  }

  private listen(type: string, listener: EventListener): EditorDisposable {
    this.element.addEventListener(type, listener)
    return new EventListenerDisposable(this.element, type, listener)
  }
}

class TextareaStringEditor implements StringEditor {
  public readonly monacoEditor: StringEditorControl

  public constructor(
    private readonly element: HTMLTextAreaElement,
    options: StringEditorOptions,
  ) {
    this.monacoEditor = new TextareaStringEditorControl(element)
    this.monacoEditor.updateOptions(options)
  }

  public focus(): void {
    this.element.focus()
  }

  public dispose(): void {
    this.element.remove()
  }
}

export class TextareaStringEditorFactory implements StringEditorFactory {
  public async create(dom: HTMLElement, uri: string, options: StringEditorOptions = {}): Promise<StringEditor> {
    if (typeof document == 'undefined') throw new Error('The textarea string editor requires a DOM environment.')

    const element = document.createElement('textarea')
    element.dataset.uri = uri
    element.value = options.value ?? ''
    element.style.width = '100%'
    element.style.height = '100%'
    element.style.fontFamily = 'monospace'
    element.style.resize = 'vertical'
    element.style.setProperty('field-sizing', 'content')
    dom.appendChild(element)
    return new TextareaStringEditor(element, options)
  }
}
