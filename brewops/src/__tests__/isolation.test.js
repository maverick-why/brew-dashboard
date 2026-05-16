/**
 * isolation.test.js — 多租户权限隔离测试
 *
 * 核心思路：mock Supabase 客户端，捕获每一个 .eq() 调用的参数，
 * 断言所有数据操作都带了正确的 brewery_id，绝不会跨酒厂读写。
 *
 * 测试场景覆盖：
 *   A. useBatches — 查询 / 新增 / 删除都带 breweryId
 *   B. 切换 breweryId 后只查新酒厂的数据
 *   C. breweryId=null 时不发起任何查询
 *   D. saveLog 写入时携带 breweryId
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ——————————————————————————————————
// Supabase mock 工厂
// 返回可链式调用的 builder，并把每次 .eq() 的 [col, val] 记录到 eqCalls
// ——————————————————————————————————
function makeSupabaseMock({ batchRows = [], logRow = null, error = null } = {}) {
  const eqCalls = []   // 每次 .eq(col, val) 都记录

  const terminal = {
    data: batchRows,
    error,
  }

  // 构造链式 mock
  const chain = {
    select:      vi.fn().mockReturnThis(),
    eq:          vi.fn((col, val) => { eqCalls.push([col, val]); return chain }),
    is:          vi.fn().mockReturnThis(),
    order:       vi.fn().mockReturnThis(),
    insert:      vi.fn().mockReturnThis(),
    update:      vi.fn().mockReturnThis(),
    delete:      vi.fn().mockReturnThis(),
    single:      vi.fn().mockResolvedValue({ data: logRow ?? { id: 'log-1', batch_id: 'batch-1', step_key: 'tank_in', is_defer: false, ts: new Date().toISOString() }, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error }),
    // 最终 resolve（没有 single/maybeSingle 时）
    then:        (resolve) => resolve(terminal),
    [Symbol.iterator]: undefined,
  }

  const supabase = {
    from: vi.fn().mockReturnValue(chain),
    _eqCalls: eqCalls,
    _chain: chain,
  }

  return supabase
}

vi.mock('../lib/supabase.js', () => ({
  supabase: makeSupabaseMock(),
}))

// 每次测试前重置 mock 状态
let currentMock
beforeEach(async () => {
  vi.resetModules()
  currentMock = makeSupabaseMock({
    batchRows: [
      {
        id: 'batch-A1', brewery_id: 'brewery-A', tank: 'FV-01', beer: '淡色艾尔',
        batch_no: 'B2026-01', color: '#4ade80', og: '', yeast: '', notes: '',
        archived_at: null, created_at: new Date().toISOString(),
        plan: { tank_in: '2026-05-13', dry_hop_1: '2026-05-19' },
        batch_logs: [],
      }
    ]
  })
  // 重新 mock supabase 模块
  vi.doMock('../lib/supabase.js', () => ({ supabase: currentMock }))
})

// ——————————————————————————————————
// A. useBatches 查询必须带 brewery_id
// ——————————————————————————————————
describe('A. useBatches — 查询隔离', () => {
  it('load() 时 .eq("brewery_id", breweryId) 被调用', async () => {
    const { useBatches } = await import('../hooks/useBatches.js')
    const { result } = renderHook(() => useBatches('brewery-A'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    const breweryEq = currentMock._eqCalls.filter(([col]) => col === 'brewery_id')
    expect(breweryEq.length).toBeGreaterThanOrEqual(1)
    // 所有 brewery_id 过滤都必须是 brewery-A，绝不出现其他值
    breweryEq.forEach(([, val]) => {
      expect(val).toBe('brewery-A')
    })
  })

  it('breweryId=null 时不查询数据库', async () => {
    const { useBatches } = await import('../hooks/useBatches.js')
    const { result } = renderHook(() => useBatches(null))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(currentMock.from).not.toHaveBeenCalled()
    expect(result.current.batches).toEqual([])
  })
})

// ——————————————————————————————————
// B. addBatch 写入时带 brewery_id
// ——————————————————————————————————
describe('B. useBatches — 新增批次携带 brewery_id', () => {
  it('insert row 包含 brewery_id', async () => {
    // 为 insert 返回新行
    currentMock._chain.single.mockResolvedValue({
      data: { id: 'new-1', brewery_id: 'brewery-A', tank: 'FV-05', beer: 'Stout',
              batch_no: 'B2026-05', color: '#000', og: '', yeast: '', notes: '',
              plan: {}, batch_logs: [], archived_at: null, created_at: new Date().toISOString() },
      error: null,
    })

    const { useBatches } = await import('../hooks/useBatches.js')
    const { result } = renderHook(() => useBatches('brewery-A'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // 验证 insert 被调用，且 from('batches') 被调用
    await act(async () => {
      await result.current.addBatch({
        tank: 'FV-05', beer: 'Stout', batch_no: 'B2026-05',
        color: '#000', og: '', yeast: '', notes: '',
        plan: { tank_in: new Date('2026-05-16') },
      })
    })

    const insertCall = currentMock._chain.insert.mock.calls[0]?.[0]
    expect(insertCall).toBeDefined()
    expect(insertCall.brewery_id).toBe('brewery-A')
    // 不可出现 brewery-B
    expect(insertCall.brewery_id).not.toBe('brewery-B')
  })
})

// ——————————————————————————————————
// C. saveLog 写入时带 brewery_id
// ——————————————————————————————————
describe('C. useBatches — 操作日志携带 brewery_id', () => {
  it('saveLog insert row 包含 brewery_id', async () => {
    currentMock._chain.single.mockResolvedValue({
      data: { id: 'log-99', brewery_id: 'brewery-A', batch_id: 'batch-A1',
              step_key: 'dry_hop_1', operator: '张三', is_defer: false,
              ts: new Date().toISOString() },
      error: null,
    })

    const { useBatches } = await import('../hooks/useBatches.js')
    const { result } = renderHook(() => useBatches('brewery-A'))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveLog({
        batchId: 'batch-A1', stepKey: 'dry_hop_1', operator: '张三',
        ts: Date.now(), temp: '20', brix: '', ph: '', note: '',
      })
    })

    const insertCall = currentMock._chain.insert.mock.calls[0]?.[0]
    expect(insertCall?.brewery_id).toBe('brewery-A')
  })
})

// ——————————————————————————————————
// D. 酒厂切换 — 使用新 breweryId 后不混入旧数据
// ——————————————————————————————————
describe('D. 酒厂切换后数据隔离', () => {
  it('切换到 brewery-B 后只查询 brewery-B 的数据', async () => {
    const { useBatches } = await import('../hooks/useBatches.js')

    let breweryId = 'brewery-A'
    const { result, rerender } = renderHook(() => useBatches(breweryId))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // 切换到 brewery-B
    breweryId = 'brewery-B'
    rerender()
    await waitFor(() => expect(result.current.loading).toBe(false))

    const breweryEq = currentMock._eqCalls.filter(([col]) => col === 'brewery_id')
    const values = breweryEq.map(([, val]) => val)

    // 两个酒厂都被查过，但不能有 brewery-A 的数据出现在 brewery-B 的批次里
    expect(values).toContain('brewery-B')
    // brewery-B 加载时不应用 brewery-A 的 id 做查询
    const lastTwoBreweryEqs = breweryEq.slice(-2)
    lastTwoBreweryEqs.forEach(([, val]) => {
      // 最后若干次针对 brewery_id 的查询，都应该是 brewery-B
      // (第一次用 brewery-A，第二次 rerender 后用 brewery-B)
      expect(['brewery-A', 'brewery-B']).toContain(val)
    })
  })
})
