import { describe, it, expect, vi, afterEach } from "vitest"
import { fetchWithRetry } from "./fetch-with-retry.js"

describe("fetchWithRetry — 의도: DRF 간헐 404 회복·키 마스킹·Referer 범위", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("재시도 대상(404)이면 백오프 후 재시도해서 성공한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nf", { status: 404 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const res = await fetchWithRetry("https://www.law.go.kr/DRF/lawSearch.do?OC=k", { retryOn: [404] })
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("재시도 대상이 아닌 상태코드는 즉시 반환한다 (호출자가 판단)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nf", { status: 404 }))
    vi.stubGlobal("fetch", fetchMock)
    const res = await fetchWithRetry("https://apis.data.go.kr/x?serviceKey=k")
    expect(res.status).toBe(404)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("Referer는 law.go.kr에만 붙는다 (data.go.kr 요청 오염 금지)", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await fetchWithRetry("https://www.law.go.kr/DRF/x")
    await fetchWithRetry("https://apis.data.go.kr/x")
    const lawHeaders = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>
    const dataHeaders = (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<string, string>
    expect(lawHeaders.Referer).toBeTruthy()
    expect(dataHeaders.Referer).toBeUndefined()
  })

  it("네트워크 실패 소진 시 에러 메시지에 인증키가 노출되지 않는다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNRESET")))
    await expect(fetchWithRetry("https://apis.data.go.kr/x?serviceKey=SECRET&p=1")).rejects.toThrow(
      /serviceKey=\*\*\*/
    )
  }, 15000)
})
