import type { JSX } from 'react/jsx-runtime'
import type { BasicNodeProps } from './BasicNode.tsx'

import { BasicNode } from './BasicNode.tsx'

export interface SubflowNodeProps extends BasicNodeProps {}

export function SubflowNode(props: SubflowNodeProps): JSX.Element {
  return <BasicNode {...props} />
}
