import type { ProjectChangeEvent } from '../../../control/common/projectNotifications.ts'

export type { ProjectChangeEvent } from '../../../control/common/projectNotifications.ts'

export type WorkbenchLanguage = 'en' | 'zh-CN'
export type WorkbenchTheme = 'dark' | 'light'
export type WorkbenchView = 'design' | 'publications' | 'runs'

export interface WorkbenchNotification {
  readonly kind: 'error' | 'success'
  readonly message: string
}

export interface WorkbenchHost {
  notify(notification: WorkbenchNotification | undefined): void
  openExternalPage(resolveUrl: () => Promise<string>): Promise<boolean>
  request(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  subscribeProject(projectId: string, listener: (event?: ProjectChangeEvent) => void): () => void
}

export interface WorkbenchLocation {
  readonly flowId?: string
  readonly projectId?: string
  readonly view: WorkbenchView
}

export interface WorkbenchNavigationOptions {
  readonly replace: boolean
}

export interface WorkbenchPreferences {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
