import type { JSX } from 'react/jsx-runtime'
import type { BasicNodeProps } from './BasicNode.tsx'

import { BasicNode } from './BasicNode.tsx'

export interface ValueNodeProps extends BasicNodeProps {}

export function ValueNode(props: ValueNodeProps): JSX.Element {
  return <BasicNode {...props} />
}
