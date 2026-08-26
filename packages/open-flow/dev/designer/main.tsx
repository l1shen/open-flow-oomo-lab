import 'virtual:uno.css'
import '../../src/ui/browser/styles.css'
import '../../src/designer/browser/styles/root.scss'
import './styles.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DesignerLab } from './lab.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('Designer Lab root not found.')

createRoot(root).render(
  <StrictMode>
    <DesignerLab />
  </StrictMode>,
)
