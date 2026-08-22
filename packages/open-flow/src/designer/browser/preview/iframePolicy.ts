const externalUrlSandboxTokens: readonly string[] = [
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-orientation-lock',
  'allow-pointer-lock',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-presentation',
  'allow-same-origin',
  'allow-scripts',
]

const inlineHtmlSandboxTokens: readonly string[] = [
  'allow-downloads',
  'allow-forms',
  'allow-modals',
  'allow-orientation-lock',
  'allow-pointer-lock',
  'allow-popups',
  'allow-presentation',
  'allow-scripts',
]

export function getIframeSandbox(inlineHtml: boolean): string {
  return (inlineHtml ? inlineHtmlSandboxTokens : externalUrlSandboxTokens).join(' ')
}
