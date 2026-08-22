import type { BrowserDesignerNotification } from './notification.ts'

import { message } from 'antd'
import { useEffect } from 'react'

export interface DesignerNotificationHostProps {
  readonly notification: BrowserDesignerNotification
}

export function DesignerNotificationHost({ notification }: DesignerNotificationHostProps): React.ReactElement {
  const [api, contextHolder] = message.useMessage()

  useEffect(
    () =>
      notification.onDidNotify(({ level, message: content }) => {
        void api.open({ type: level, content })
      }),
    [api, notification],
  )

  return contextHolder
}
