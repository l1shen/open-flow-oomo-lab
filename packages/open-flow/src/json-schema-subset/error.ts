export class SchemaError<E = unknown> extends Error {
  public readonly items: readonly SchemaErrorItem<E>[]

  public constructor(items: readonly SchemaErrorItem<E>[] = []) {
    super(createSchemaErrorMessage(items))
    this.name = 'SchemaError'
    this.items = items
  }
}

export type SchemaErrorItem<E = unknown> = CompiledSchemaErrorItem | ExternalSchemaErrorItem<E>

export type CompiledSchemaErrorItem = {
  readonly kind: typeof SchemaErrorItemKind.Compiled
  readonly path: (number | string)[]
  readonly message: string
}

export type ExternalSchemaErrorItem<E = unknown> = {
  readonly kind: typeof SchemaErrorItemKind.External
  readonly error: E
}

export const SchemaErrorItemKind = Object.freeze({
  Compiled: 0,
  External: 1,
})

export type SchemaErrorItemKind = (typeof SchemaErrorItemKind)[keyof typeof SchemaErrorItemKind]

export function stringifySchemaError<E = unknown>(errorItem: SchemaErrorItem<E>): string {
  switch (errorItem.kind) {
    case SchemaErrorItemKind.Compiled: {
      const { message, path } = errorItem
      return `${message} (at ${path.length > 0 ? path.join('.') : '$root'})`
    }
    case SchemaErrorItemKind.External: {
      return String(errorItem.error)
    }
  }
}

function createSchemaErrorMessage(items: readonly SchemaErrorItem[]): string {
  switch (items.length) {
    case 0: {
      return 'without any items'
    }
    case 1: {
      return stringifySchemaError(items[0])
    }
    default: {
      return `${stringifySchemaError(items[0])} ... omit the rest ${items.length - 1} items`
    }
  }
}
