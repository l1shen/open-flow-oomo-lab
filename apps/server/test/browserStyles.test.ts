import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const styles = await readFile(new URL('../browser/styles.css', import.meta.url), 'utf8')

describe('Browser style boundaries', () => {
  it('keeps native control resets inside Server-owned chrome', () => {
    expect(styles).not.toMatch(/(?:^|\n)(?:button|input)(?=[\s,:{])/)
  })
})
