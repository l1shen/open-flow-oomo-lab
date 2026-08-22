import crypto from 'node:crypto'
import path from 'node:path'

export interface GenerateScopedName {
  (name: string, filename: string, css: string): string
}

const cssHashes = new Map<string, string>()

function getCSSHash(filename: string, css: string): string {
  let hash = cssHashes.get(filename)
  if (hash == null) {
    hash = crypto.createHash('md5').update(css).digest('hex').slice(0, 5)
    cssHashes.set(filename, hash)
  }
  return hash
}

export const generateScopedName: GenerateScopedName = (className, filename, css) => {
  const moduleName = path.basename(filename).split('.')[0]
  const hash = getCSSHash(filename, css)
  return `${moduleName}_${className}_${hash}`
}
