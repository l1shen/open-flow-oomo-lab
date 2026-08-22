declare module 'bun:test' {
  type Test = typeof import('node:test').test
  type Suite = typeof import('node:test').describe

  export const afterAll: typeof import('node:test').after
  export const afterEach: typeof import('vitest').afterEach
  export const describe: Suite & { readonly concurrent: Suite }
  export const expect: typeof import('vitest').expect
  export const it: Test
  export const test: Test

  export function onTestFinished(callback: () => void | Promise<unknown>): void
}
