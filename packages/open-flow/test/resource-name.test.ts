import { describe, expect, test } from 'vitest'
import { resourceNameIssue, resourceNameMaxLength } from '../src/project/common/change.ts'

describe('resource names', () => {
  test('accepts display names after caller normalization', () => {
    expect(resourceNameIssue('项目 Alpha 1')).toBeUndefined()
    expect(resourceNameIssue('  项目 Alpha 1  ')).toBeUndefined()
    expect(resourceNameIssue('x'.repeat(resourceNameMaxLength))).toBeUndefined()
  })

  test('rejects empty, oversized, and control-character names', () => {
    expect(resourceNameIssue(' \t ')).toBe('empty')
    expect(resourceNameIssue('x'.repeat(resourceNameMaxLength + 1))).toBe('tooLong')
    expect(resourceNameIssue('Line\nBreak')).toBe('controlCharacter')
    expect(resourceNameIssue(`Null\0Byte`)).toBe('controlCharacter')
  })

  test('keeps resource names readable and command-line friendly', () => {
    expect(resourceNameIssue('获取 Emails_2')).toBeUndefined()
    expect(resourceNameIssue('Project-12')).toBeUndefined()
    expect(resourceNameIssue('flow12&&&!@#$')).toBe('specialCharacter')
    expect(resourceNameIssue('_Project')).toBe('specialCharacter')
    expect(resourceNameIssue('Flow-')).toBe('specialCharacter')
    expect(resourceNameIssue('Project.v2')).toBe('specialCharacter')
  })
})
