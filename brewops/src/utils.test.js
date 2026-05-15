import { describe, it, expect, vi, afterEach } from 'vitest'
import { addD, diffD, fmtFull, parseD, stepStatus } from './utils.js'

describe('addD', () => {
  it('adds positive days', () => {
    const d = new Date('2025-01-01')
    expect(addD(d, 3).toISOString().startsWith('2025-01-04')).toBe(true)
  })
  it('adds negative days', () => {
    const d = new Date('2025-01-05')
    expect(addD(d, -2).toISOString().startsWith('2025-01-03')).toBe(true)
  })
})

describe('diffD', () => {
  it('returns 0 for same day', () => {
    const d = new Date('2025-06-01')
    expect(diffD(d, d)).toBe(0)
  })
  it('returns positive when b is after a', () => {
    expect(diffD(new Date('2025-01-01'), new Date('2025-01-04'))).toBe(3)
  })
})

describe('fmtFull', () => {
  it('formats date as YYYY-MM-DD', () => {
    expect(fmtFull(new Date('2025-03-07'))).toBe('2025-03-07')
  })
  it('returns empty string for falsy', () => {
    expect(fmtFull(null)).toBe('')
  })
})

describe('parseD', () => {
  it('parses valid date string', () => {
    const d = parseD('2025-05-15')
    expect(d).not.toBeNull()
    expect(fmtFull(d)).toBe('2025-05-15')
  })
  it('returns null for empty string', () => {
    expect(parseD('')).toBeNull()
  })
})

describe('stepStatus', () => {
  afterEach(() => vi.useRealTimers())

  it('returns done for past date', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01'))
    expect(stepStatus('2025-05-30')).toBe('done')
  })
  it('returns today for today', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01'))
    expect(stepStatus('2025-06-01')).toBe('today')
  })
  it('returns tomorrow for +1', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01'))
    expect(stepStatus('2025-06-02')).toBe('tomorrow')
  })
  it('returns soon for +2 to +3', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01'))
    expect(stepStatus('2025-06-03')).toBe('soon')
  })
  it('returns future for +4 and beyond', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2025-06-01'))
    expect(stepStatus('2025-06-05')).toBe('future')
  })
})
