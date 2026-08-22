import type { Option } from '@wopjs/tsur'
import type { ValueHandleDef } from '../../../../../schema/index.ts'

import { parseInputsDef } from '../base/parse.ts'

// This only happens to have the same shape as inputs_def.
export const parseValues = parseInputsDef as (data: unknown) => Option<ValueHandleDef[]>
