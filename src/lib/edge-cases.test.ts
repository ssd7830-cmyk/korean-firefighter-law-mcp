import { describe, it, expect, vi, afterEach, beforeEach } from "vitest"
import { formatBody, truncate } from "./format.js"
import { FireApiClient } from "./fire-api-client.js"
import { InMemoryLruCache } from "./cache.js"
import { resolveFireLawAlias } from "./search-normalizer.js"
import { collectText } from "../tools/fire-law.js"

describe("최종 소탕 — 경계값·오류 경로", () => {
  beforeEach(() => { process.env.DATA_GO_KR_KEY = "k" })
  afterEach(() => { delete process.env.DATA_GO_KR_KEY; vi.unstubAllGlobals() })

  it("결과 50건 초과면 생략 건수를 표기한다 (조용한 절단 금지)", () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ n: i }))
    const text = formatBody({ items: { item: items }, totalCount: 60 }, "제목")
    expect(text).toContain("외 10건 생략")
  })

  it("신뢰할 수 없는 totalCount를 전체건수로 오인하지 않는다", () => {
    const items = Array.from({ length: 100 }, (_, i) => ({ n: i }))
    const text = formatBody({ items: { item: items }, totalCount: 179 }, "제목")
    expect(text).toContain("조회 100건")
    expect(text).toContain("외 50건 생략")
    expect(text).not.toContain("179")
  })

  it("정확히 한도 길이면 자르지 않는다", () => {
    const s = "가".repeat(8000)
    expect(truncate(s)).toBe(s)
  })

  it("비재시도 HTTP 오류는 상태코드를 담아 안내한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Bad Request", { status: 400 })))
    await expect(new FireApiClient(new InMemoryLruCache()).call("S", "op", {}, 1000)).rejects.toThrow(/400/)
  })

  it("200 + 빈 본문은 재시도 안내를 준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 200 })))
    await expect(new FireApiClient(new InMemoryLruCache()).call("S", "op", {}, 1000)).rejects.toThrow(/빈 응답/)
  })

  it("undefined 파라미터는 URL에서 제외한다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ response: { header: { resultCode: "00" }, body: { items: { item: [{}] } } } }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    await new FireApiClient(new InMemoryLruCache()).call("S", "op", { a: undefined, b: "x" }, 1000)
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain("b=x")
    expect(url).not.toContain("a=")
  })

  it("별칭 꼬리(시행규칙)를 보존한다", () => {
    expect(resolveFireLawAlias("위험물법 시행규칙")).toBe("위험물안전관리법 시행규칙")
  })

  it("호 아래 목(目)까지 수집한다", () => {
    const out: string[] = []
    collectText({ 조문내용: "제1조", 항: { 항내용: "①", 호: { 호내용: "1.", 목: [{ 목내용: "가." }, { 목내용: "나." }] } } }, out)
    expect(out).toEqual(["제1조", "①", "1.", "가.", "나."])
  })
})

describe("소탕 3차 — 깨진 응답·캐시 용량 경계", () => {
  beforeEach(() => { process.env.DATA_GO_KR_KEY = "k" })
  afterEach(() => { delete process.env.DATA_GO_KR_KEY; vi.unstubAllGlobals() })

  it("JSON도 XML도 아닌 응답은 원문 노출 대신 명확한 안내를 준다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Internal Server Error", { status: 200 })))
    await expect(new FireApiClient(new InMemoryLruCache()).call("S", "op", {}, 1000)).rejects.toThrow(/해석할 수 없는 응답/)
  })

  it("가득 찬 캐시에 기존 키 갱신은 다른 항목을 밀어내지 않는다", async () => {
    const cache = new InMemoryLruCache(2)
    cache.set("a", 1, 10000)
    cache.set("b", 2, 10000)
    cache.set("a", 9, 10000) // 갱신 — eviction 아님
    expect(cache.get("a")).toBe(9)
    expect(cache.get("b")).toBe(2)
  })
})
