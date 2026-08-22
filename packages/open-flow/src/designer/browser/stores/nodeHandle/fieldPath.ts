import { WeakCache } from '@wopjs/weak-cache'
import { asString } from '../../base/trivial.ts'

const keyCache = new WeakMap<Array<string | number>, FieldPathKey>()
const fieldCache = new WeakCache<FieldPathKey, FieldPath>()

export type FieldPathKey = string

export class FieldPath {
  public readonly length: number
  public readonly key: FieldPathKey

  public static get(path?: string | number | Array<string | number>): FieldPath {
    const key = Array.isArray(path) ? (keyCache.get(path) ?? keyCache.set(path, asString(path) || '[]').get(path)!) : path != null ? asString([path]) : '[]'

    return fieldCache.get(key) || fieldCache.set(key, new FieldPath(key, path)).get(key)!
  }

  public static fromKey(key: FieldPathKey): FieldPath {
    return FieldPath.get(JSON.parse(key) as string | number | Array<string | number>)
  }

  private constructor(
    key: FieldPathKey,
    private readonly path?: string | number | Array<string | number>,
  ) {
    this.key = key
    this.length = Array.isArray(this.path) ? this.path.length : this.path != null ? 1 : 0
  }

  public at(index: number): string | number | undefined {
    if (Array.isArray(this.path)) {
      return this.path.at(index)
    }
    if (index === 0 || index === -1) {
      return this.path
    }
  }

  public append = (key: string | number): FieldPath =>
    FieldPath.get(Array.isArray(this.path) ? [...this.path, key] : this.path != null ? [this.path, key] : key)

  public parent(): FieldPath {
    if (Array.isArray(this.path)) {
      return FieldPath.get(this.path.slice(0, -1))
    }
    return FieldPath.get()
  }

  public equals(path: FieldPath): boolean {
    return this.key === path.key
  }

  /** Returns whether `path` is a direct child of this path. */
  public matchChild(path: FieldPath): boolean {
    if (this.length + 1 !== path.length) {
      return false
    }

    for (let i = 0; i < this.length; i++) {
      if (path.at(i) !== this.at(i)) {
        return false
      }
    }

    return true
  }

  /** Returns whether this path is a descendant of `path`, excluding `path` itself. */
  public isInside(path: FieldPath): boolean {
    if (this.length <= path.length) {
      return false
    }

    for (let i = 0; i < path.length; i++) {
      if (path.at(i) !== this.at(i)) {
        return false
      }
    }

    return true
  }

  public last(): string | number | undefined {
    return this.at(-1)
  }

  public toJSON(): string | number | Array<string | number> | undefined {
    return this.path
  }
}
