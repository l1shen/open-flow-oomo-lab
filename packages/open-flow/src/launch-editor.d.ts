declare module 'launch-editor/guess.js' {
  function guessEditor(specifiedEditor?: string): readonly [string | null, ...string[]]

  export default guessEditor
}
