import type { ReactElement } from 'react'
import type { WorkbenchTheme } from '../contract.ts'

import { useEffect, useRef, useState } from 'react'
import { CodeMirrorStringEditorFactory } from '../../codeMirrorStringEditor.ts'

type Editor = Awaited<ReturnType<CodeMirrorStringEditorFactory['create']>>

interface Props {
  readonly ariaLabel: string
  readonly disabled: boolean
  readonly errorLabel: string
  readonly loadingLabel: string
  readonly location?: { readonly column: number; readonly line: number }
  readonly onChange: (value: string) => void
  readonly theme: WorkbenchTheme
  readonly uri: string
  readonly value: string
}

export function CodeEditor({ ariaLabel, disabled, errorLabel, loadingLabel, location, onChange, theme, uri, value }: Props): ReactElement {
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<Editor>()
  const syncing = useRef(false)
  const valueRef = useRef(value)
  const disabledRef = useRef(disabled)
  const locationRef = useRef(location)
  const onChangeRef = useRef(onChange)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  valueRef.current = value
  disabledRef.current = disabled
  locationRef.current = location
  onChangeRef.current = onChange

  useEffect(() => {
    const container = host.current!
    let current: Editor | undefined
    let changeListener: { dispose(): void } | undefined
    let disposed = false
    setFailed(false)
    setLoading(true)
    void import('@uiw/codemirror-theme-github')
      .then(({ githubDark, githubLight }) =>
        new CodeMirrorStringEditorFactory({ theme: theme == 'dark' ? githubDark : githubLight }).create(container, uri, {
          ariaLabel,
          automaticLayout: true,
          language: 'javascript',
          readOnly: disabledRef.current,
          value: valueRef.current,
          wordWrap: 'off',
        }),
      )
      .then((created) => {
        if (disposed) {
          created.dispose()
          return
        }
        current = created
        editor.current = created
        if (created.monacoEditor.getValue() != valueRef.current) created.monacoEditor.setValue(valueRef.current)
        changeListener = created.monacoEditor.onDidChangeModelContent(() => {
          if (!syncing.current) onChangeRef.current(created.monacoEditor.getValue())
        })
        const position = locationRef.current
        if (position != null) created.revealPosition?.(position.line, position.column)
        setLoading(false)
      })
      .catch(() => {
        if (!disposed) {
          setFailed(true)
          setLoading(false)
        }
      })
    return () => {
      disposed = true
      changeListener?.dispose()
      current?.dispose()
      if (editor.current === current) editor.current = undefined
    }
  }, [ariaLabel, theme, uri])

  useEffect(() => {
    const current = editor.current
    if (current == null || current.monacoEditor.getValue() == value) return
    syncing.current = true
    current.monacoEditor.setValue(value)
    syncing.current = false
  }, [value])

  useEffect(() => {
    editor.current?.monacoEditor.updateOptions({ readOnly: disabled })
  }, [disabled])

  useEffect(() => {
    if (location != null) editor.current?.revealPosition?.(location.line, location.column)
  }, [location?.column, location?.line])

  return (
    <div className="code-editor">
      <div className="code-editor-host" ref={host} />
      {loading && <span className="code-editor-state">{loadingLabel}</span>}
      {failed && <span className="code-editor-state error">{errorLabel}</span>}
    </div>
  )
}
