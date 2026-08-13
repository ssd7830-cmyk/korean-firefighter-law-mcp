import { describe, expect, it } from "vitest"
import { FixedWindowRateLimiter, clientIp } from "./rate-limit.js"

describe("FixedWindowRateLimiter", () => {
  it("고정 구간 한도를 넘으면 막고 다음 구간에는 다시 허용한다", () => {
    const limiter = new FixedWindowRateLimiter(2, 60_000)
    expect(limiter.allow("a", 0)).toBe(true)
    expect(limiter.allow("a", 1)).toBe(true)
    expect(limiter.allow("a", 2)).toBe(false)
    expect(limiter.allow("a", 60_000)).toBe(true)
  })

  it("서로 다른 IP가 계속 들어와도 저장 항목 수가 상한을 넘지 않는다", () => {
    const limiter = new FixedWindowRateLimiter(1, 60_000, 3)
    for (let i = 0; i < 20; i++) limiter.allow(`ip-${i}`, i)
    expect(limiter.size).toBeLessThanOrEqual(3)
  })
})

describe("clientIp", () => {
  const request = (remoteAddress: string, forwarded?: string) =>
    ({ socket: { remoteAddress }, headers: { "x-forwarded-for": forwarded } }) as any

  it("기본값은 위조 가능한 전달 헤더를 믿지 않는다", () => {
    expect(clientIp(request("127.0.0.1", "203.0.113.10"), false)).toBe("127.0.0.1")
  })

  it("신뢰 프록시 설정 때만 첫 전달 IP를 사용한다", () => {
    expect(clientIp(request("127.0.0.1", "203.0.113.10, 10.0.0.2"), true)).toBe("203.0.113.10")
  })
})
