/**
 * ℤ/nℤ 环与有限域计算测试（v2.2）。
 */
import { describe, expect, it } from 'vitest'
import {
  buildZnTables,
  eulerPhi,
  gcd,
  idempotentsOf,
  isPrime,
  isUnit,
  isZeroDivisor,
  subscriptNumber,
  unitsOf,
  zeroDivisorsOf,
} from './rings'

describe('v2.2 ℤₙ 环与域', () => {
  it('gcd 与欧拉函数', () => {
    expect(gcd(12, 18)).toBe(6)
    expect(gcd(7, 5)).toBe(1)
    expect(eulerPhi(1)).toBe(1)
    expect(eulerPhi(6)).toBe(2)
    expect(eulerPhi(7)).toBe(6)
    expect(eulerPhi(12)).toBe(4)
  })

  it('ℤ₆：单位 {1,5}、零因子 {2,3,4}、2×3 ≡ 0', () => {
    const tables = buildZnTables(6)
    expect(tables.n).toBe(6)
    expect(tables.multiplication[2]?.[3]).toBe(0)
    expect(tables.addition[5]?.[2]).toBe(1)
    expect(unitsOf(6)).toEqual([1, 5])
    expect(zeroDivisorsOf(6)).toEqual([2, 3, 4])
    expect(isUnit(6, 5)).toBe(true)
    expect(isUnit(6, 2)).toBe(false)
    expect(isZeroDivisor(6, 0)).toBe(false)
    expect(isZeroDivisor(6, 2)).toBe(true)
  })

  it('ℤ₇ 是域：全部非零元素是单位、无零因子', () => {
    expect(unitsOf(7)).toEqual([1, 2, 3, 4, 5, 6])
    expect(zeroDivisorsOf(7)).toEqual([])
    expect(isPrime(7)).toBe(true)
  })

  it('ℤ₉：零因子 {3,6}；ℤ₄：零因子 {2}；ℤ₁₂：零因子 {2,3,4,6,8,9,10}', () => {
    expect(zeroDivisorsOf(9)).toEqual([3, 6])
    expect(zeroDivisorsOf(4)).toEqual([2])
    expect(zeroDivisorsOf(12)).toEqual([2, 3, 4, 6, 8, 9, 10])
  })

  it('幂等元：ℤ₆ → {0,1,3,4}；ℤ₁₂ → {0,1,4,9}', () => {
    expect(idempotentsOf(6)).toEqual([0, 1, 3, 4])
    expect(idempotentsOf(12)).toEqual([0, 1, 4, 9])
  })

  it('isPrime 与下标排版', () => {
    expect([1, 4, 6, 9, 10].every((n) => !isPrime(n))).toBe(true)
    expect([2, 3, 5, 11].every((n) => isPrime(n))).toBe(true)
    expect(subscriptNumber(6)).toBe('₆')
    expect(subscriptNumber(12)).toBe('₁₂')
  })

  it('buildZnTables 入参钳制到 [2, 12]', () => {
    expect(buildZnTables(1).n).toBe(2)
    expect(buildZnTables(99).n).toBe(12)
  })
})
