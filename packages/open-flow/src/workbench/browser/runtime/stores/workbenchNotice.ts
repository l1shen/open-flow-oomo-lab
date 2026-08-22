import type { TFunction } from 'val-i18n'
import type { WorkbenchNotification } from '../contract.ts'

import { ApiError } from '../api.ts'

export type Notice = WorkbenchNotification

export type SetNotice = (notice: Notice | undefined) => void

export function errorNotice(error: unknown, t: TFunction): Notice {
  if (error instanceof ApiError) return { kind: 'error', message: `${error.message} (${error.code})` }
  if (error instanceof Error) return { kind: 'error', message: error.message }
  return { kind: 'error', message: t('notice.requestFailed') }
}
