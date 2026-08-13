import { describe, it, expect, vi } from "vitest"
import { searchFireStats, SearchFireStatsSchema } from "./fire-stats.js"
import { getEmsStats } from "./ems-stats.js"
import { getBuildingFacilities } from "./fire-building.js"
import { searchFireLaw, getFireLawText } from "./fire-law.js"
import { searchFirePrecedents } from "./fire-precedents.js"

function fakeFireClient(items: unknown[]) {
  return {
    call: vi.fn(async () => ({ items: { item: items }, totalCount: items.length })),
  } as any
}

describe("도구 핸들러 — 의도: API 파라미터 매핑이 스펙과 일치", () => {
  it("search_fire_stats는 확인된 오퍼레이션·파라미터명으로 호출한다", async () => {
    const client = fakeFireClient([{ ocrn_ymd: "20250101" }])
    await searchFireStats(client, { date: "20250101", pageNo: 1, numOfRows: 100 })
    const [service, op, params] = client.call.mock.calls[0]
    expect(service).toBe("FireInformationService")
    expect(op).toBe("getOcByfrstFireSmrzPcnd")
    expect(params.ocrn_ymd).toBe("20250101")
  })

  it("get_ems_stats는 스펙 파라미터명(sidoHqOgidNm 등)으로 매핑한다", async () => {
    const client = fakeFireClient([{}])
    await getEmsStats(client, { sido: "서울소방재난본부", month: "202501", pageNo: 1, numOfRows: 100 })
    const [service, op, params] = client.call.mock.calls[0]
    expect(service).toBe("EmergencyStatisticsService")
    expect(op).toBe("getTrafficAccidentEmgActStats")
    expect(params.sidoHqOgidNm).toBe("서울소방재난본부")
    expect(params.rcptYm).toBe("202501")
  })

  it("get_building_facilities는 buildingName으로 결과를 좁히고 건수도 갱신한다", async () => {
    const client = fakeFireClient([{ 대상물명: "롯데타워" }, { 대상물명: "시청사" }])
    const result = await getBuildingFacilities(client, { sido: "서울특별시", buildingName: "롯데", pageNo: 1, numOfRows: 50 })
    expect(result.content[0].text).toContain("전체 1건")
    expect(result.content[0].text).not.toContain("시청사")
  })

  it("날짜 형식이 틀리면 스키마가 힌트와 함께 거부한다", () => {
    const parsed = SearchFireStatsSchema.safeParse({ date: "2025-01-01" })
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toContain("YYYYMMDD")
  })
})

describe("법령 도구 — 의도: 정확한 법령 선택", () => {
  it("검색 결과에 시행령이 먼저 와도 본법 정확 매칭을 고른다", async () => {
    const client = {
      search: vi.fn(async () => ({
        LawSearch: {
          law: [
            { 법령명한글: "소방시설 설치 및 관리에 관한 법률 시행령", 법령일련번호: "111" },
            { 법령명한글: "소방시설 설치 및 관리에 관한 법률", 법령일련번호: "222" },
          ],
        },
      })),
      service: vi.fn(async () => ({
        법령: {
          기본정보: { 법령명_한글: "소방시설 설치 및 관리에 관한 법률" },
          조문: { 조문단위: [{ 조문내용: "제10조(내용)" }] },
        },
      })),
    } as any
    const result = await getFireLawText(client, { lawName: "소방시설법", jo: "제10조" })
    const serviceParams = client.service.mock.calls[0][1]
    expect(serviceParams.MST).toBe("222") // 시행령(111)이 아니라 본법(222)
    expect(serviceParams.JO).toBe("001000")
    expect(result.content[0].text).toContain("제10조(내용)")
  })

  it("검색어 없으면 API 호출 없이 소방 법령 목록을 준다", async () => {
    const client = { search: vi.fn() } as any
    const result = await searchFireLaw(client, { query: undefined, display: 20 })
    expect(client.search).not.toHaveBeenCalled()
    expect(result.content[0].text).toContain("소방기본법")
  })

  it("판례 0건이면 키워드 조정 힌트를 준다", async () => {
    const client = { search: vi.fn(async () => ({ PrecSearch: {} })) } as any
    const result = await searchFirePrecedents(client, { query: "존재하지않는키워드", display: 20 })
    expect(result.content[0].text).toContain("키워드를 바꿔서")
  })
})

describe("의도: 캐시 TTL은 데이터 확정 여부를 따른다 (빨간불 사냥 2차)", () => {
  it("구급통계 — 지난달 이전 월은 길게, 이번 달·월 미지정은 짧게 캐시한다", async () => {
    const now = new Date()
    const thisMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
    const longTtl = 7 * 24 * 60 * 60 * 1000
    const client = fakeFireClient([{}])
    await getEmsStats(client, { sido: "서울소방재난본부", month: "202001", pageNo: 1, numOfRows: 100 })
    expect(client.call.mock.calls[0][3]).toBe(longTtl) // 확정된 과거 월
    await getEmsStats(client, { sido: "서울소방재난본부", month: thisMonth, pageNo: 1, numOfRows: 100 })
    expect(client.call.mock.calls[1][3]).toBeLessThan(longTtl) // 이번 달은 아직 갱신됨
    await getEmsStats(client, { sido: "서울소방재난본부", pageNo: 1, numOfRows: 100 })
    expect(client.call.mock.calls[2][3]).toBeLessThan(longTtl) // 월 미지정 = 최신 포함
  })
})

describe("의도: 오류·경계 안내 (빨간불 사냥 2차)", () => {
  it("법령 텍스트 — lawName도 mst도 없으면 안내를 반환한다 (throw 아님)", async () => {
    const result = await getFireLawText({ search: vi.fn(), service: vi.fn() } as any, {})
    expect(result.content[0].text).toContain("lawName 또는 mst")
  })

  it("법령 검색 — 단일 결과(XML 단일 객체)도 1건으로 나온다", async () => {
    const client = {
      search: vi.fn(async () => ({
        LawSearch: { law: { 법령명한글: "소방기본법", 법령일련번호: "1", 소관부처명: "소방청", 시행일자: "20240101" } },
      })),
    } as any
    const result = await searchFireLaw(client, { query: "소방기본법", display: 20 })
    expect(result.content[0].text).toContain("1. 소방기본법")
  })
})
