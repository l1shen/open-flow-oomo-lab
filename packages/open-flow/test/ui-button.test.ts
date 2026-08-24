import { expect, test } from 'bun:test'
import { Button } from '../src/ui/browser/button.tsx'

test('forwards refs through the shared Button', () => {
  expect((Button as unknown as { readonly $$typeof: symbol }).$$typeof).toBe(Symbol.for('react.forward_ref'))
})
