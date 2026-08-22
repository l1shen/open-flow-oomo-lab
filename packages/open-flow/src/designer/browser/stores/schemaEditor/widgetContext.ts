import type { Disposer } from '@wopjs/disposable'
import type { ReadonlyVal, Val } from 'value-enhancer'
import type { OutputHandleDef } from '../../../../schema/index.ts'
import type { FieldPathKey } from '../nodeHandle/fieldPath.ts'
import type { InOut, Role } from '../nodeHandle/widgetContext.ts'

import { attachSetter, derive } from 'value-enhancer'
import { toPlainObject } from '../../base/trivial.ts'
import { FieldPath } from '../nodeHandle/fieldPath.ts'

export { FieldPath, InOut, FieldPathKey as PathKey, Role }

export interface WidgetContextConfig {
  readonly role: Role
  readonly inout: InOut
  /** Set `false` to disable `any` `anyOf` types. */
  readonly enableAny?: boolean
  readonly restrict$?: ReadonlyVal<OutputHandleDef | undefined>
}

export class WidgetContext {
  public readonly role: Role
  public readonly inout: InOut
  public readonly enableAny: boolean
  public readonly restrict$: ReadonlyVal<OutputHandleDef | undefined> | undefined

  public constructor(
    config: WidgetContextConfig,
    public readonly schema$: Val<unknown>,
    public readonly expanded$: Val<Record<FieldPathKey, boolean> | undefined>,
    public readonly createSchemaEditor: (dom: HTMLDivElement, schemaText$: Val<string> | ReadonlyVal<string>) => Disposer | void,
  ) {
    this.role = config.role
    this.inout = config.inout
    this.enableAny = config.enableAny ?? true
    this.restrict$ = config.restrict$
  }

  public deriveExpanded$(path: FieldPath): Val<boolean> {
    return attachSetter(
      derive(this.expanded$, (expanded) => expanded?.[path.key] ?? false),
      (expanded) => {
        const allExpanded = toPlainObject(this.expanded$.value) as Record<PropertyKey, boolean> | undefined
        if (expanded) {
          if (!allExpanded?.[path.key]) {
            this.expanded$.set({ ...allExpanded, [path.key]: true })
          }
        } else {
          if (allExpanded?.[path.key]) {
            const { [path.key]: _, ...rest } = allExpanded
            this.expanded$.set(rest)
          }
        }
      },
    )
  }

  public expand(path: FieldPath): void {
    this.expanded$.set({ ...this.expanded$.value, [path.key]: true })
  }

  public get canEditSchema(): boolean {
    return this.role === 'author'
  }

  public get canEditValue(): boolean {
    return this.role === 'author' || this.role === 'user'
  }
}
