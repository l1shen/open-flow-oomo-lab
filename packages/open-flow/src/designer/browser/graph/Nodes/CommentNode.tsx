import type { JSX } from 'react/jsx-runtime'
import type { BasicNodeProps } from './BasicNode.tsx'

import { BasicNode } from './BasicNode.tsx'

export interface CommentNodeProps extends BasicNodeProps {}

export function CommentNode(props: CommentNodeProps): JSX.Element {
  return <BasicNode {...props} />
}
