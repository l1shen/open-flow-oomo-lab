import type { JSX } from 'react/jsx-runtime'
import type { BasicNodeProps } from './BasicNode.tsx'

import { BasicNode } from './BasicNode.tsx'

export interface ErrorNodeProps extends BasicNodeProps {}

export function ErrorNode(props: ErrorNodeProps): JSX.Element {
  return <BasicNode {...props} />
}
