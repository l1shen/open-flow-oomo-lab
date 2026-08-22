import type { JSX } from 'react/jsx-runtime'
import type { BasicNodeProps } from './BasicNode.tsx'

import { BasicNode } from './BasicNode.tsx'

export interface InputNodeProps extends BasicNodeProps {}

export function InputNode(props: InputNodeProps): JSX.Element {
  return <BasicNode {...props} />
}
