export type VariableBundle<K extends string> = {
  [P in K]: boolean
} & {
  toInt32(): number
  toString(): string
}

export class VariableBundleDescription<K extends string> {
  public readonly keys: readonly K[]
  private readonly clazz: { new (int32: number): VariableBundleImpls<K> }

  public constructor(_keys: readonly K[]) {
    const keys = Object.freeze(_keys.toSorted())
    if (keys.length > 32) {
      throw new Error(`cannot define ${keys.length} keys which is greater than 32`)
    }
    this.keys = keys
    this.clazz = class extends VariableBundleImpls<K> {
      public constructor(int32: number) {
        super(keys, int32)
      }
    }
    for (const [i, key] of this.keys.entries()) {
      const mask = 1 << i

      Object.defineProperty(this.clazz.prototype, key, {
        enumerable: true,
        get: function get(this: VariableBundleImpls<K>): boolean {
          return !!(this.int32 & mask)
        },
        set: function set(this: VariableBundleImpls<K>, value: boolean): void {
          if (value) {
            this.int32 |= mask
          } else {
            this.int32 &= ~mask
          }
        },
      })
    }
  }

  public toBundle(): VariableBundle<K>
  public toBundle(int32: number): VariableBundle<K>
  public toBundle(variable: Partial<Record<K, boolean>>): VariableBundle<K>

  public toBundle(variable?: number | Partial<Record<K, boolean>>): VariableBundle<K> {
    let int32 = 0

    if (typeof variable === 'number') {
      int32 = variable
    } else if (variable) {
      for (const [i, key] of this.keys.entries()) {
        if (variable[key]) {
          int32 |= 1 << i
        }
      }
    }
    return new this.clazz(int32) as VariableBundle<K>
  }
}

class VariableBundleImpls<K extends string> {
  private readonly keys: readonly K[]
  protected int32: number

  public constructor(keys: readonly K[], int32: number) {
    this.keys = keys
    this.int32 = int32
  }

  public toInt32(): number {
    return this.int32
  }

  public toString(): string {
    const object: Record<string, boolean> = {}
    for (const key of this.keys) {
      object[key] = (this as unknown as Record<string, boolean>)[key]
    }
    return JSON.stringify(object)
  }
}
