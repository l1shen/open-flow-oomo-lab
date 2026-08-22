export interface EditorDisposable {
  dispose(): void
}

export interface ContentSizeChangedEvent {
  readonly contentHeight: number
}

export interface StringEditorModel {
  setLanguage?(language: string): void
}

export interface StringEditorControl {
  getContentHeight(): number
  getDomNode(): HTMLElement | null
  getModel(): StringEditorModel | null
  getValue(): string
  hasWidgetFocus(): boolean
  onDidBlurEditorWidget(listener: () => void): EditorDisposable
  onDidChangeModelContent(listener: () => void): EditorDisposable
  onDidContentSizeChange(listener: (event: ContentSizeChangedEvent) => void): EditorDisposable
  onDidFocusEditorWidget(listener: () => void): EditorDisposable
  setValue(value: string): void
  updateOptions(options: StringEditorOptions): void
}

export interface StringEditorOptions {
  ariaLabel?: string
  automaticLayout?: boolean
  domReadOnly?: boolean
  folding?: boolean
  glyphMargin?: boolean
  language?: string
  lineNumbersMinChars?: number
  minimap?: { enabled?: boolean }
  overviewRulerLanes?: number
  readOnly?: boolean
  scrollbar?: { handleMouseWheel?: boolean }
  scrollBeyondLastLine?: boolean
  value?: string
  wordWrap?: string
  wrappingStrategy?: string
}

export interface StringEditor {
  readonly monacoEditor: StringEditorControl
  focus(): void
  revealPosition?(line: number, column: number): void
  dispose(): void
}
