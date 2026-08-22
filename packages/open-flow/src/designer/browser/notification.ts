import type { AddEventListener } from '@wopjs/event'

import { event, send } from '@wopjs/event'

export interface DesignerNotification {
  success(message: string): void
  error(message: string): void
}

export interface DesignerNotificationCallback {
  (level: DesignerNotificationEvent['level'], message: string): void
}

export interface DesignerNotificationEvent {
  readonly level: 'success' | 'error'
  readonly message: string
}

export class BrowserDesignerNotification implements DesignerNotification {
  public readonly onDidNotify: AddEventListener<DesignerNotificationEvent> = event<DesignerNotificationEvent>()

  public constructor(private readonly onNotification?: DesignerNotificationCallback) {}

  public success(message: string): void {
    this.notify('success', message)
  }

  public error(message: string): void {
    this.notify('error', message)
  }

  public dispose(): void {
    this.onDidNotify.dispose()
  }

  private notify(level: DesignerNotificationEvent['level'], message: string): void {
    const hasListener = this.onDidNotify.size() > 0
    send(this.onDidNotify, { level, message })
    if (this.onNotification) {
      this.onNotification(level, message)
    } else if (!hasListener && level == 'error') {
      console.error(message)
    } else if (!hasListener) {
      console.info(message)
    }
  }
}
