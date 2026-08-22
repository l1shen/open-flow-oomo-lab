import styles from './modelMark.module.scss'

import { clsx } from 'clsx'

type ModelMarkTone = 'amber' | 'blue' | 'cyan' | 'indigo' | 'lime' | 'magenta' | 'neutral' | 'pink' | 'red' | 'slate' | 'teal' | 'violet'

export interface ModelMarkAppearance {
  readonly label: string
  readonly tone: ModelMarkTone
}

interface ModelMarkRule extends ModelMarkAppearance {
  readonly terms: readonly string[]
}

const modelMarkRules: readonly ModelMarkRule[] = [
  { label: 'DS', tone: 'blue', terms: ['deepseek'] },
  { label: 'K', tone: 'cyan', terms: ['kimi', 'moonshot'] },
  { label: 'Q', tone: 'magenta', terms: ['qwen', 'qwq', 'qvq'] },
  { label: 'C', tone: 'amber', terms: ['claude', 'anthropic'] },
  { label: 'G', tone: 'violet', terms: ['gemini'] },
  { label: 'GPT', tone: 'teal', terms: ['gpt', 'openai', 'o1', 'o3', 'o4'] },
  { label: 'GLM', tone: 'indigo', terms: ['glm', 'zhipu'] },
  { label: 'M', tone: 'red', terms: ['mistral', 'codestral'] },
  { label: 'L', tone: 'pink', terms: ['llama', 'meta'] },
  { label: 'X', tone: 'slate', terms: ['grok', 'xai'] },
  { label: 'MM', tone: 'lime', terms: ['minimax'] },
  { label: 'D', tone: 'red', terms: ['doubao'] },
  { label: 'FW', tone: 'amber', terms: ['fireworks'] },
]

function modelTerms(model: string): readonly string[] {
  return model.toLowerCase().split(/[^a-z0-9]+/)
}

export function modelMarkAppearance(model: string): ModelMarkAppearance {
  const terms = modelTerms(model)
  for (const rule of modelMarkRules) {
    if (rule.terms.some((ruleTerm) => terms.some((term) => term.startsWith(ruleTerm)))) {
      return { label: rule.label, tone: rule.tone }
    }
  }
  return { label: 'AI', tone: 'neutral' }
}

export interface ModelMarkProps {
  readonly model: string
}

export function ModelMark(props: ModelMarkProps): React.ReactElement {
  const appearance = modelMarkAppearance(props.model)
  return (
    <span className={clsx(styles.mark, styles[appearance.tone])} aria-hidden="true">
      {appearance.label}
    </span>
  )
}
