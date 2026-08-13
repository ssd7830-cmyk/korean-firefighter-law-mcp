import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { FireApiClient } from "./fire-api-client.js"
import { InMemoryLruCache } from "./cache.js"

function okJson(items: unknown[]): Response {
  return new Response(
    JSON.stringify({
      response: { header: { resultCode: "00", resultMsg: "OK" }, body: { items: { item: items }, totalCount: items.length } },
    }),
    { status: 200 }
  )
}

describe("FireApiClient — 의도: 키 처리·오류 안내·캐시 정책", () => {
  beforeEach(() => {
    process.env.DATA_GO_KR_KEY = "abc+def=="
  })
  afterEach(() => {
    delete process.env.DATA_GO_KR_KEY
    vi.unstubAllGlobals()
  })

  it("디코딩 키(특수문자 포함)는 URL 인코딩해서 보낸다", async () => {
    const fetchMock = vi.fn(async () => okJson([{ a: 1 }]))
    vi.stubGlobal("fetch", fetchMock)
    await new FireApiClient(new InMemoryLruCache()).call("S", "op", {}, 1000)
    expect(String(fetchMock.mock.calls[0][0])).toContain("serviceKey=abc%2Bdef%3D%3D")
  })

  it("인코딩 키(% 포함)는 이중 인코딩하지 않는다", async () => {
    process.env.DATA_GO_KR_KEY = "abc%2Bdef"
    const fetchMock = vi.fn(async () => okJson([{ a: 1 }]))
    vi.stubGlobal("fetch", fetchMock)
    await new FireApiClient(new InMemoryLruCache()).call("S", "op", {}, 1000)
    expect(String(fetchMock.mock.calls[0][0])).toContain("serviceKey=abc%2Bdef&")
  })

  it("키 미등록 XML 오류를 활용신청 안내가 담긴 메시지로 바꾼다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>",
            { status: 200 }
          )
      )
    )
    await expect(new FireApiClient(new InMemoryLruCache()).call("S", "op", {}, 1000)).rejects.toThrow(
      /SERVICE_KEY_IS_NOT_REGISTERED_ERROR.*활용신청/s
    )
  })

  it("정상 결과는 캐시된다 (같은 호출 2번 → fetch 1번)", async () => {
    const fetchMock = vi.fn(async () => okJson([{ a: 1 }]))
    vi.stubGlobal("fetch", fetchMock)
    const client = new FireApiClient(new InMemoryLruCache())
    await client.call("S", "op", { p: "1" }, 60_000)
    await client.call("S", "op", { p: "1" }, 60_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("빈 결과는 캐시하지 않는다 (데이터 지연 중 빈 응답이 7일 박제되면 안 됨)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson([]))
      .mockResolvedValueOnce(okJson([{ a: 1 }]))
    vi.stubGlobal("fetch", fetchMock)
    const client = new FireApiClient(new InMemoryLruCache())
    await client.call("S", "op", { p: "1" }, 7 * 24 * 60 * 60 * 1000)
    await client.call("S", "op", { p: "1" }, 7 * 24 * 60 * 60 * 1000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("resultCode가 00이 아니면 메시지를 담아 던진다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ response: { header: { resultCode: "99", resultMsg: "INVALID PARAM" } } }), {
            status: 200,
          })
      )
    )
    await expect(new FireApiClient(new InMemoryLruCache()).call("S", "op", {}, 1000)).rejects.toThrow(
      /99.*INVALID PARAM/s
    )
  })
})

describe("FireApiClient — 응답 변형 흡수 (위험물 서비스)", () => {
  beforeEach(() => {
    process.env.DATA_GO_KR_KEY = "testkey"
  })
  afterEach(() => {
    delete process.env.DATA_GO_KR_KEY
    vi.unstubAllGlobals()
  })

  it("response 래퍼 없음 + items 배열 + resultCode '0'도 정상 파싱한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              header: { resultCode: "0", resultMsg: "NORMAR_SERVICE" },
              body: { items: [{ chemicalname: "아세톤" }], totalCount: 1 },
            }),
            { status: 200 }
          )
      )
    )
    const body = await new FireApiClient(new InMemoryLruCache()).call("materialInfoSvc", "getMaterialList", {}, 1000)
    expect((body.items as any).item[0].chemicalname).toBe("아세톤")
  })
})

describe("FireApiClient — 상세 조회 단수 item 변형", () => {
  beforeEach(() => {
    process.env.DATA_GO_KR_KEY = "testkey"
  })
  afterEach(() => {
    delete process.env.DATA_GO_KR_KEY
    vi.unstubAllGlobals()
  })

  it("body.item(단수)도 items.item으로 통일한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              header: { resultCode: "0" },
              body: { item: { casno: "67-64-1", boilingpoint: "56 ℃" } },
            }),
            { status: 200 }
          )
      )
    )
    const body = await new FireApiClient(new InMemoryLruCache()).call("materialInfoSvc", "getMaterialInfo", {}, 1000)
    expect((body.items as any).item.casno).toBe("67-64-1")
  })
})
