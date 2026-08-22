import type { JSX } from 'react/jsx-runtime'
import type { BasicNodeProps } from './BasicNode.tsx'

import { BasicNode } from './BasicNode.tsx'

export interface ConditionNodeProps extends BasicNodeProps {}

export function ConditionNode(props: ConditionNodeProps): JSX.Element {
  return <BasicNode {...props} />
}
