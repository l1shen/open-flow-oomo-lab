import type { CsvReader } from './csvReader.ts'

import { createContext } from 'react'

export const CsvReaderContext: React.Context<CsvReader | null> = /* @__PURE__ */ createContext<CsvReader | null>(null)
