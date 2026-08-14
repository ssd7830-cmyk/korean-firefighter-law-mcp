import { describe, it, expect, vi } from "vitest"
import { statsTtlFor as statsTtl } from "../lib/cache.js"
import { TTL } from "../lib/cache.js"

describe("statsTtl — 확정 통계 캐시 정책", () => {
  it("지난달 이전 날짜는 확정 통계로 길게 캐시한다", () => {
    expect(statsTtl("19990101")).toBe(TTL.CLOSED_STATS)
    expect(statsTtl("20200615")).toBe(TTL.CLOSED_STATS)
  })

  it("이번 달 날짜는 아직 갱신될 수 있으니 짧게 캐시한다", () => {
    const thisMonth = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit",
    }).format().replace("-", "") + "15"
    expect(statsTtl(thisMonth)).toBe(TTL.SEARCH)
  })

  it("UTC 서버의 월말 경계에서도 한국 월을 기준으로 한다", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-31T15:30:00Z")) // 한국 9월 1일
    expect(statsTtl("20260831")).toBe(TTL.CLOSED_STATS)
    expect(statsTtl("20260901")).toBe(TTL.SEARCH)
    vi.useRealTimers()
  })
})
