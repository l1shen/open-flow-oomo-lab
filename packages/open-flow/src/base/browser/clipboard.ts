export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export async function readTextFromClipboard(): Promise<string> {
  return navigator.clipboard.readText()
}
