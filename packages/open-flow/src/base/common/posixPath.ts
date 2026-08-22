import { basename, dirname, extname, join as joinPath } from 'pathe'

export { basename, dirname, extname }

export function isAbsolute(path: string): boolean {
  return path.startsWith('/')
}

export function isParent(path: string, candidate: string): boolean {
  if (!path || !candidate || path == candidate || candidate.length > path.length) return false

  const parent = candidate.endsWith('/') ? candidate : `${candidate}/`
  return path.startsWith(parent)
}

export function join(...paths: string[]): string {
  const joined = joinPath(...paths)
  return joined.startsWith('//') ? joined.replace(/^\/+/, '/') : joined
}
