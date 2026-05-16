/**
 * utils.test.js — 纯函数单元测试
 * 不依赖网络 / Supabase，直接验证日期逻辑
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { stepStatus, diffD, addD, fmtD, fmtFull, parseD, tod } from '../utils.js'

// ---------- 固定"今天" = 2026-05-16 ----------
const FIXED_TODAY = new Date('2026-05-16T00:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_TODAY)
})
afterEach(() => {
  vi.useRealTimers()
})

// ——— tod ———
describe('tod()', () => {
  it('返回今天零点', () => {
    const t = tod()
    expect(t.getHours()).toBe(0)
    expect(t.getMinutes()).toBe(0)
    expect(t.getSeconds()).toBe(0)
  })
})

// ——— diffD ———
describe('diffD(a, b)', () => {
  it('同一天 → 0', () => expect(diffD(new Date('2026-05-16'), new Date('2026-05-16'))).toBe(0))
  it('b 比 a 晚 1 天 → 1', () => expect(diffD(new Date('2026-05-16'), new Date('2026-05-17'))).toBe(1))
  it('b 比 a 早 1 天 → -1', () => expect(diffD(new Date('2026-05-16'), new Date('2026-05-15'))).toBe(-1))
})

// ——— stepStatus ———
describe('stepStatus()', () => {
  it('null → future', () => expect(stepStatus(null)).toBe('future'))
  it('今天 → today', () => expect(stepStatus(new Date('2026-05-16'))).toBe('today'))
  it('明天 → tomorrow', () => expect(stepStatus(new Date('2026-05-17'))).toBe('tomorrow'))
  it('后天(+2) → soon', () => expect(stepStatus(new Date('2026-05-18'))).toBe('soon'))
  it('+3 天 → soon', () => expect(stepStatus(new Date('2026-05-19'))).toBe('soon'))
  it('+4 天 → future', () => expect(stepStatus(new Date('2026-05-20'))).toBe('future'))
  it('昨天 → done', () => expect(stepStatus(new Date('2026-05-15'))).toBe('done'))
  it('10天前 → done', () => expect(stepStatus(new Date('2026-05-06'))).toBe('done'))
})

// ——— addD ———
describe('addD(d, n)', () => {
  it('+7 天', () => {
    const result = addD(new Date('2026-05-16'), 7)
    expect(fmtFull(result)).toBe('2026-05-23')
  })
  it('-3 天', () => {
    const result = addD(new Date('2026-05-16'), -3)
    expect(fmtFull(result)).toBe('2026-05-13')
  })
})

// ——— parseD ———
describe('parseD(s)', () => {
  it('合法日期字符串 → Date', () => {
    const d = parseD('2026-05-16')
    expect(d).toBeInstanceOf(Date)
    expect(fmtFull(d)).toBe('2026-05-16')
  })
  it('空字符串 → null', () => expect(parseD('')).toBeNull())
  it('null → null', () => expect(parseD(null)).toBeNull())
  it('非法字符串 → null', () => expect(parseD('not-a-date')).toBeNull())
})

// ——— fmtD ———
describe('fmtD(d)', () => {
  it('正常日期', () => expect(fmtD(new Date('2026-05-16'))).toBe('5/16'))
  it('null → 破折号', () => expect(fmtD(null)).toBe('—'))
})
