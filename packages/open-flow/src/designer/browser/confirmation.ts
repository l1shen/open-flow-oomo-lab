export interface DesignerConfirmation {
  confirm(message: string): Promise<boolean>
}

export interface BrowserDesignerConfirmationOptions {
  readonly onConfirm?: (message: string) => boolean | Promise<boolean>
}

export class BrowserDesignerConfirmation implements DesignerConfirmation {
  public constructor(private readonly options: BrowserDesignerConfirmationOptions = {}) {}

  public async confirm(message: string): Promise<boolean> {
    if (this.options.onConfirm) {
      return this.options.onConfirm(message)
    } else if (typeof window != 'undefined') {
      return window.confirm(message)
    } else {
      return false
    }
  }
}
