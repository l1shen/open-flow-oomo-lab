import type { ReadonlyVal, Val } from 'value-enhancer'
import type { LocaleTextStore } from '../../../../localization/common/localization.ts'
import type { ConditionExpression, InputHandleDef } from '../../../../schema/index.ts'
import type { FieldPath, FieldPathKey } from '../nodeHandle/fieldPath.ts'
import type { InOut, Role } from '../nodeHandle/widgetContext.ts'
import type { Logical } from './constants.ts'

import { attachSetter, derive } from 'value-enhancer'
import { setPartial } from '../../base/trivial.ts'

export interface WidgetContextConfig {
  readonly role: Role
  readonly isDefault?: boolean
  readonly userLocales?: LocaleTextStore
}

export class WidgetContext {
  public readonly role: Role
  public readonly inout: InOut = 'out'
  public readonly isDefault: boolean
  public readonly userLocales?: LocaleTextStore
  public constructor(
    config: WidgetContextConfig,
    public readonly inputHandleDefs$: ReadonlyVal<InputHandleDef[] | undefined>,
    public readonly logical$: Val<Logical | undefined>,
    public readonly expressions$: Val<ConditionExpression[] | undefined>,
    public readonly collapsed$: Val<Record<FieldPathKey, boolean> | undefined>,
  ) {
    this.role = config.role
    this.isDefault = config.isDefault ?? false
    this.userLocales = config.userLocales
  }

  public get canEditSchema(): boolean {
    return this.role === 'author'
  }

  public get canEditValue(): boolean {
    return this.role === 'author' || this.role === 'user'
  }

  public deriveCollapsed$(path: FieldPath): Val<boolean> {
    return attachSetter(
      derive(this.collapsed$, (collapsed) => collapsed?.[path.key] ?? false),
      setPartial(this.collapsed$, path.key),
    )
  }
}
