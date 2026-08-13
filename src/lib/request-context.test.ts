import { describe, it, expect, vi, afterEach } from "vitest"
import { requestContext } from "./request-context.js"
import { FireApiClient } from "./fire-api-client.js"
import { InMemoryLruCache } from "./cache.js"

describe("requestContext — 동시 요청 간 인증키 격리", () => {
  afterEach(() => {
    delete process.env.DATA_GO_KR_KEY
    vi.unstubAllGlobals()
  })

  it("동시 요청 2개가 각자 헤더 키를 쓰고 섞이지 않는다", async () => {
    const urls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url))
        await new Promise((r) => setTimeout(r, 10)) // 실행 겹침 유도
        return new Response(
          JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item: [{}] } } } }),
          { status: 200 }
        )
      })
    )
    const client = new FireApiClient(new InMemoryLruCache())
    await Promise.all([
      requestContext.run({ dataGoKrKey: "userA-key" }, () => client.call("S", "op", { who: "a" }, 1000)),
      requestContext.run({ dataGoKrKey: "userB-key" }, () => client.call("S", "op", { who: "b" }, 1000)),
    ])
    const urlA = urls.find((u) => u.includes("who=a"))
    const urlB = urls.find((u) => u.includes("who=b"))
    expect(urlA).toContain("serviceKey=userA-key")
    expect(urlB).toContain("serviceKey=userB-key")
  })

  it("컨텍스트 키가 서버 환경변수보다 우선한다", async () => {
    process.env.DATA_GO_KR_KEY = "server-key"
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item: [{}] } } } }),
      { status: 200 }
    ))
    vi.stubGlobal("fetch", fetchMock)
    const client = new FireApiClient(new InMemoryLruCache())
    await requestContext.run({ dataGoKrKey: "header-key" }, () => client.call("S", "op", {}, 1000))
    expect(String(fetchMock.mock.calls[0][0])).toContain("serviceKey=header-key")
  })

  it("컨텍스트 밖(stdio 모드)에서는 환경변수를 쓴다", async () => {
    process.env.DATA_GO_KR_KEY = "env-key"
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item: [{}] } } } }),
      { status: 200 }
    ))
    vi.stubGlobal("fetch", fetchMock)
    await new FireApiClient(new InMemoryLruCache()).call("S", "op", {}, 1000)
    expect(String(fetchMock.mock.calls[0][0])).toContain("serviceKey=env-key")
  })
})
