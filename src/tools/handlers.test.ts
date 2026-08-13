import { describe, it, expect, vi } from "vitest"
import { searchFireStats, SearchFireStatsSchema } from "./fire-stats.js"
import { getEmsStats, GetEmsStatsSchema } from "./ems-stats.js"
import { getBuildingFacilities, searchFireBuilding } from "./fire-building.js"
import { searchFireLaw, getFireLawText, getFireLawAnnex } from "./fire-law.js"
import { searchFirePrecedents } from "./fire-precedents.js"
import { searchFireAdminRules, SearchFireAdminRulesSchema, getFireAdminRuleText } from "./fire-admin-rules.js"
import { searchHazmat } from "./hazmat.js"
import { koreanDate } from "../lib/korean-date.js"

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

  it("자연어 화재 조회 기본값은 일자 결과를 최대 1000건까지 한 번에 받는다", () => {
    expect(SearchFireStatsSchema.parse({ date: "20250101" }).numOfRows).toBe(1000)
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

  it("건물·시설 도구는 활용가이드로 확정된 서비스·오퍼레이션을 호출한다", async () => {
    const client = fakeFireClient([{}])
    await searchFireBuilding(client, { sido: "서울특별시", pageNo: 1, numOfRows: 50 })
    expect(client.call.mock.calls[0][0]).toBe("SpecificFireObjectInfoService")
    expect(client.call.mock.calls[0][1]).toBe("getAccomList")
    await getBuildingFacilities(client, { sido: "서울특별시", pageNo: 1, numOfRows: 50 })
    expect(client.call.mock.calls[1][0]).toBe("SpecificFireObjectFirefightingSysInfoService")
    expect(client.call.mock.calls[1][1]).toBe("getAccomFirefightingSysList")
  })

  it("get_building_facilities는 buildingName으로 결과를 좁히고 건수도 갱신한다", async () => {
    const client = fakeFireClient([{ 대상물명: "롯데타워" }, { 대상물명: "시청사" }])
    const result = await getBuildingFacilities(client, { sido: "서울특별시", buildingName: "롯데", pageNo: 1, numOfRows: 50 })
    expect(result.content[0].text).toContain("조회 1건")
    expect(result.content[0].text).not.toContain("시청사")
  })

  it("건물명 검색은 첫 페이지 밖의 결과까지 조회한다", async () => {
    const client = {
      call: vi.fn(async (_service, _op, params) =>
        params.pageNo === 1
          ? { items: { item: Array.from({ length: 1000 }, (_, i) => ({ objNm: `시청사${i}` })) }, totalCount: 1000 }
          : { items: { item: [{ objNm: "롯데호텔" }] }, totalCount: 1001 }
      ),
    } as any
    const result = await getBuildingFacilities(client, {
      sido: "서울특별시",
      buildingName: "롯데호텔",
      pageNo: 1,
      numOfRows: 50,
    })
    expect(client.call).toHaveBeenCalledTimes(2)
    expect(result.content[0].text).toContain("롯데호텔")
    expect(result.content[0].text).toContain("조회 1건")
  })

  it("특정소방대상물도 건물명으로 전체 페이지를 검색한다", async () => {
    const client = {
      call: vi.fn(async (_service, _op, params) =>
        params.pageNo === 1
          ? { items: { item: Array.from({ length: 1000 }, (_, i) => ({ objNm: `시청사${i}` })) }, totalCount: 1000 }
          : { items: { item: [{ objNm: "롯데타워" }] }, totalCount: 1001 }
      ),
    } as any
    const result = await searchFireBuilding(client, {
      sido: "서울특별시",
      buildingName: "롯데타워",
      pageNo: 1,
      numOfRows: 50,
    })
    expect(client.call).toHaveBeenCalledTimes(2)
    expect(result.content[0].text).toContain("롯데타워")
  })

  it("구급 응답은 교통사고 통계만 연결된 범위를 명시한다", async () => {
    const result = await getEmsStats(fakeFireClient([{}]), {
      sido: "서울소방재난본부",
      pageNo: 1,
      numOfRows: 100,
    })
    expect(result.content[0].text).toContain("현재 연결 범위는 교통사고 구급활동")
  })

  it("날짜 형식이 틀리면 스키마가 힌트와 함께 거부한다", () => {
    const parsed = SearchFireStatsSchema.safeParse({ date: "2025-01-01" })
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toContain("YYYYMMDD")
  })

  it("형식은 맞아도 달력에 없는 날짜·월은 스키마가 거부한다", () => {
    expect(SearchFireStatsSchema.safeParse({ date: "20250230" }).success).toBe(false)
    expect(GetEmsStatsSchema.safeParse({ sido: "인천소방본부", month: "202513" }).success).toBe(false)
  })

  it("빈 행정규칙 검색어는 외부 API로 보내지 않는다", () => {
    expect(SearchFireAdminRulesSchema.safeParse({ query: "" }).success).toBe(false)
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

  it("시행령 별표 번호와 키워드로 공식 별표 원문을 좁힌다", async () => {
    const client = {
      search: vi.fn(async () => ({ LawSearch: { law: { 법령명한글: "소방시설법 시행령", 법령일련번호: "7" } } })),
      service: vi.fn(async () => ({ 법령: { 기본정보: { 법령명_한글: "소방시설법 시행령" }, 별표: { 별표단위: [
        { 별표번호: "0003", 별표내용: "다른 별표" },
        { 별표번호: "0004", 별표제목: "특정소방대상물", 별표내용: ["공동주택 스프링클러", "창고 소화설비"] },
      ] } } })),
    } as any
    const result = await getFireLawAnnex(client, { lawName: "소방시설법 시행령", annex: "4", query: "공동주택" })
    expect(result.content[0].text).toContain("공동주택 스프링클러")
    expect(result.content[0].text).not.toContain("창고 소화설비")
  })

  it("NFPC/NFTC 검색 결과 ID로 행정규칙 본문을 조회한다", async () => {
    const client = {
      search: vi.fn(async () => ({ AdmRulSearch: { admrul: { 행정규칙명: "NFPC 103", 행정규칙일련번호: "210" } } })),
      service: vi.fn(async () => ({ AdmRulService: {
        행정규칙기본정보: { 행정규칙명: "NFPC 103" }, 조문내용: { 조문단위: { 조문내용: "2.5.3 공동주택 성능기준" } },
      } })),
    } as any
    const result = await getFireAdminRuleText(client, { ruleName: "NFPC 103", section: "2.5.3" })
    expect(client.service).toHaveBeenCalledWith("admrul", { ID: "210" })
    expect(result.content[0].text).toContain("2.5.3 공동주택 성능기준")
  })

  it("NFPC 103을 요청했을 때 먼저 나온 NFPC 103A를 고르지 않는다", async () => {
    const client = {
      search: vi.fn(async () => ({ AdmRulSearch: { admrul: [
        { 행정규칙명: "간이스프링클러설비의 화재안전성능기준(NFPC 103A)", 행정규칙일련번호: "1031" },
        { 행정규칙명: "스프링클러설비의 화재안전성능기준(NFPC 103)", 행정규칙일련번호: "1030" },
      ] } })),
      service: vi.fn(async () => ({ AdmRulService: { 조문내용: "NFPC 103 본문" } })),
    } as any
    await getFireAdminRuleText(client, { ruleName: "NFPC 103" })
    expect(client.service).toHaveBeenCalledWith("admrul", { ID: "1030" })
  })
})

describe("의도: 캐시 TTL은 데이터 확정 여부를 따른다 (빨간불 사냥 2차)", () => {
  it("구급통계 — 지난달 이전 월은 길게, 이번 달·월 미지정은 짧게 캐시한다", async () => {
    const thisMonth = koreanDate().compact.slice(0, 6)
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

describe("의도: 내용 질문도 답이 나온다 (본문검색 폴백)", () => {
  it("법령 이름 검색 0건이면 본문검색(search=2)으로 재시도한다", async () => {
    const client = {
      search: vi
        .fn()
        .mockResolvedValueOnce({ LawSearch: {} }) // 이름 검색 0건
        .mockResolvedValueOnce({
          LawSearch: { law: { 법령명한글: "건축물의 피난ㆍ방화구조 등의 기준에 관한 규칙", 법령일련번호: "9" } },
        }),
    } as any
    const result = await searchFireLaw(client, { query: "방화문 설치 기준", display: 20 })
    expect(client.search.mock.calls[1][2].search).toBe("2") // 2차 호출이 본문검색
    expect(result.content[0].text).toContain("조문 내용 검색")
    expect(result.content[0].text).toContain("피난ㆍ방화구조")
  })

  it("행정규칙 검색 — 이름 매칭이 나오면 목록으로 반환한다", async () => {
    const client = {
      search: vi.fn(async () => ({
        AdmRulSearch: {
          admrul: [
            { 행정규칙명: "스프링클러설비의 화재안전성능기준(NFPC 103)", 행정규칙종류: "고시", 소관부처명: "국립소방연구원", 발령일자: "20241201" },
          ],
        },
      })),
    } as any
    const result = await searchFireAdminRules(client, { query: "스프링클러", display: 20 })
    expect(client.search.mock.calls[0][0]).toBe("admrul")
    expect(result.content[0].text).toContain("NFPC 103")
  })

  it("행정규칙 검색도 이름 0건이면 본문검색으로 폴백한다", async () => {
    const client = {
      search: vi
        .fn()
        .mockResolvedValueOnce({ AdmRulSearch: {} })
        .mockResolvedValueOnce({
          AdmRulSearch: { admrul: { 행정규칙명: "건축물 방화구획 적용 지침", 행정규칙종류: "훈령" } },
        }),
    } as any
    const result = await searchFireAdminRules(client, { query: "방화문", display: 20 })
    expect(client.search.mock.calls[1][2].search).toBe("2")
    expect(result.content[0].text).toContain("본문 검색")
  })
})

describe("위험물 도구 — 목록 매칭 + 상세 조회", () => {
  const LIST = {
    items: {
      item: [
        { chemicalname: "아세톤", casno: "67-64-1", hazardmaterialclass: "제4류 인화성액체", unno: "1090" },
        { chemicalname: "아세톤 알코올", casno: "123-42-2", hazardmaterialclass: "제4류" },
      ],
    },
    totalCount: 2,
  }

  it("정확한 물질명이면 CAS 번호로 상세(getMaterialInfo)를 조회한다", async () => {
    const client = {
      call: vi
        .fn()
        .mockResolvedValueOnce(LIST)
        .mockResolvedValueOnce({ items: { item: [{ chemicalname: "아세톤", usepurpose: "용제" }] }, totalCount: 1 }),
    } as any
    const result = await searchHazmat(client, { query: "아세톤", display: 10 })
    expect(client.call.mock.calls[1][1]).toBe("getMaterialInfo")
    expect(client.call.mock.calls[1][2].casNo).toBe("67-64-1")
    expect(result.content[0].text).toContain("위험물 상세 — 아세톤")
  })

  it("복수 매칭이면 품명·CAS가 담긴 목록을 반환한다", async () => {
    const client = { call: vi.fn(async () => LIST) } as any
    const result = await searchHazmat(client, { query: "아세", display: 10 })
    expect(result.content[0].text).toContain("2건")
    expect(result.content[0].text).toContain("제4류 인화성액체")
  })
})
