import { describe, it, expect } from "vitest"
import { statsTtl } from "./fire-stats.js"
import { TTL } from "../lib/cache.js"

describe("statsTtl — 확정 통계 캐시 정책", () => {
  it("지난달 이전 날짜는 확정 통계로 길게 캐시한다", () => {
    expect(statsTtl("19990101")).toBe(TTL.CLOSED_STATS)
    expect(statsTtl("20200615")).toBe(TTL.CLOSED_STATS)
  })

  it("이번 달 날짜는 아직 갱신될 수 있으니 짧게 캐시한다", () => {
    const now = new Date()
    const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}15`
    expect(statsTtl(thisMonth)).toBe(TTL.SEARCH)
  })
})
