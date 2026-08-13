import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { LawApiClient } from "./law-api-client.js"
import { InMemoryLruCache } from "./cache.js"

describe("LawApiClient — 의도: 키 안내·장애 안내·Referer", () => {
  beforeEach(() => {
    process.env.LAW_OC = "testoc"
  })
  afterEach(() => {
    delete process.env.LAW_OC
    vi.unstubAllGlobals()
  })

  it("LAW_OC 없으면 발급처가 담긴 에러를 낸다", async () => {
    delete process.env.LAW_OC
    await expect(new LawApiClient(new InMemoryLruCache()).search("law", "소방기본법")).rejects.toThrow(
      /open\.law\.go\.kr/
    )
  })

  it("HTML 응답이 오면 원인 후보(키·도메인 등록)를 안내한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><body>오류</body></html>", { status: 200 })))
    await expect(new LawApiClient(new InMemoryLruCache()).search("law", "소방기본법")).rejects.toThrow(/HTML/)
  })

  it("빈 응답이면 일시 장애 안내를 낸다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })))
    await expect(new LawApiClient(new InMemoryLruCache()).search("law", "소방기본법")).rejects.toThrow(/빈 응답/)
  })

  it("law.go.kr 요청에는 Referer가 자동 주입된다 (없으면 법제처가 거부)", async () => {
    const fetchMock = vi.fn(
      async () => new Response("<LawSearch><law><법령명한글>소방기본법</법령명한글></law></LawSearch>", { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)
    await new LawApiClient(new InMemoryLruCache()).search("law", "소방기본법")
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect((init.headers as Record<string, string>).Referer).toBeTruthy()
  })

  it("같은 검색 2번이면 fetch는 1번 (캐시)", async () => {
    const fetchMock = vi.fn(
      async () => new Response("<LawSearch><law><법령명한글>소방기본법</법령명한글></law></LawSearch>", { status: 200 })
    )
    vi.stubGlobal("fetch", fetchMock)
    const client = new LawApiClient(new InMemoryLruCache())
    await client.search("law", "소방기본법")
    await client.search("law", "소방기본법")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
