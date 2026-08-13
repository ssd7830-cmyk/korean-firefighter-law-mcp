import { describe, it, expect, vi } from "vitest"
import { InMemoryLruCache } from "./cache.js"

describe("InMemoryLruCache", () => {
  it("set/get 기본 동작", () => {
    const cache = new InMemoryLruCache(10)
    cache.set("a", { v: 1 }, 1000)
    expect(cache.get("a")).toEqual({ v: 1 })
    expect(cache.get("없는키")).toBeUndefined()
  })

  it("TTL 만료 시 undefined", () => {
    vi.useFakeTimers()
    const cache = new InMemoryLruCache(10)
    cache.set("a", "data", 1000)
    vi.advanceTimersByTime(1001)
    expect(cache.get("a")).toBeUndefined()
    vi.useRealTimers()
  })

  it("maxSize 초과 시 가장 오래된 항목 제거 (LRU)", () => {
    const cache = new InMemoryLruCache(2)
    cache.set("a", 1, 10000)
    cache.set("b", 2, 10000)
    cache.get("a") // a를 최신으로
    cache.set("c", 3, 10000) // b가 밀려남
    expect(cache.get("a")).toBe(1)
    expect(cache.get("b")).toBeUndefined()
    expect(cache.get("c")).toBe(3)
  })
})
