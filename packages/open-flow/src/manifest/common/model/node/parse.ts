import type { Option } from '@wopjs/tsur'

import { parseNumber } from '../../../../base/common/parse.ts'

export const parseProgressWeight = (data: unknown): Option<number | undefined> =>
  parseNumber(data).map((value) => (Number.isFinite(value) && value > 0 ? value : undefined))
