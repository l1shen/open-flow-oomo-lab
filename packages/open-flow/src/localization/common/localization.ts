import type { Result } from '@wopjs/tsur'
import type { Val } from 'value-enhancer'

export interface LocaleTextMap {
  readonly [key: string]: string
}

export interface LocaleTextStore {
  readonly 'en': Val<LocaleTextMap>
  readonly 'zh-CN': Val<LocaleTextMap>
  readonly [language: string]: Val<LocaleTextMap> | undefined
}

export interface TranslateText {
  (text: string, from?: string, to?: string): Promise<Result<string, string>>
}
