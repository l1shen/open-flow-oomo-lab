import type { JSX } from 'react/jsx-runtime'
import type { BasicNodeProps } from './BasicNode.tsx'

import { BasicNode } from './BasicNode.tsx'

export interface OutputNodeProps extends BasicNodeProps {}

export function OutputNode(props: OutputNodeProps): JSX.Element {
  return <BasicNode {...props} />
}
