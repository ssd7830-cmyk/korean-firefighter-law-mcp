import { describe, it, expect, vi, afterEach } from "vitest"
import { routeQuestion, extractDate } from "./query-router.js"

describe("routeQuestion — 질문이 반드시 올바른 조회로 이어진다", () => {
  it("법령명 + 조번호 → 조문 조회", () => {
    const r = routeQuestion("소방시설법 제10조 알려줘")
    expect(r.tool).toBe("get_fire_law_text")
    expect(r.args.lawName).toBe("소방시설법")
    expect(r.args.jo).toBe("10")
  })

  it("조의N 형식도 해석한다", () => {
    const r = routeQuestion("화재예방법 제10조의2 내용")
    expect(r.tool).toBe("get_fire_law_text")
    expect(r.args.jo).toBe("10의2")
  })

  it("제 없는 10조와 시행령 꼬리를 보존한다", () => {
    const r = routeQuestion("화재예방법 시행령 5조 알려줘")
    expect(r).toEqual({ tool: "get_fire_law_text", args: { lawName: "화재예방법 시행령", jo: "5" } })
  })

  it("법령명만 → 법령 검색", () => {
    const r = routeQuestion("위험물안전관리법 검색해줘")
    expect(r.tool).toBe("search_fire_law")
  })

  it("판례 키워드 → 판례 검색 (법령명이 있어도 판례 우선)", () => {
    const r = routeQuestion("소방시설 점검 판례 찾아줘")
    expect(r.tool).toBe("search_fire_precedents")
    expect(String(r.args.query)).toContain("소방시설 점검")
  })

  it("위험물 질문 → 물질 검색 (군더더기 제거 후 물질명만)", () => {
    const r = routeQuestion("아세톤 위험물이야?")
    expect(r.tool).toBe("search_hazmat")
    expect(r.args.query).toBe("아세톤")
  })

  it("번호라는 말이 없어도 UN·CAS 식별자를 위험물 검색으로 보낸다", () => {
    expect(routeQuestion("UN 1090")).toEqual({ tool: "search_hazmat", args: { query: "1090" } })
    expect(routeQuestion("CAS 67-64-1")).toEqual({ tool: "search_hazmat", args: { query: "67-64-1" } })
  })

  it("위험물'법' 질문은 물질 검색이 아니라 법령으로 간다", () => {
    const r = routeQuestion("위험물안전관리법 제5조 알려줘")
    expect(r.tool).toBe("get_fire_law_text")
    expect(r.args.lawName).toBe("위험물안전관리법")
  })

  it("화재안전기준·고시 → 행정규칙 검색", () => {
    const r = routeQuestion("스프링클러 화재안전기준 알려줘")
    expect(r.tool).toBe("search_fire_admin_rules")
    expect(String(r.args.query)).toContain("스프링클러")
  })

  it("자연어로 시설 설치 기준을 물으면 시설명만으로 행정규칙을 검색한다", () => {
    const r = routeQuestion("firefighter-law MCP로 아파트 스프링클러 설치 기준 찾아줘")
    expect(r).toEqual({ tool: "search_fire_admin_rules", args: { query: "스프링클러" } })
  })

  it("군더더기 단어(관련·에 대해)는 검색어에서 뺀다 — 0건 방지", () => {
    expect(routeQuestion("소방 관련 판례 찾아줘").args.query).toBe("소방")
    expect(routeQuestion("화재 판례에 대해 알려줘").args.query).toBe("화재")
  })

  it("화재 + 날짜 → 화재통계 (한국어 날짜)", () => {
    const r = routeQuestion("2025년 1월 3일 화재 몇 건이야?")
    expect(r.tool).toBe("search_fire_stats")
    expect(r.args.date).toBe("20250103")
  })

  it("구급 + 시도 → 구급통계 (시도본부명으로 변환)", () => {
    const r = routeQuestion("서울 구급 출동 통계 보여줘")
    expect(r.tool).toBe("get_ems_stats")
    expect(r.args.sido).toBe("서울소방재난본부")
  })

  it("본부 접미사를 지역마다 지어내지 않고 실제 명칭으로 변환한다", () => {
    expect(routeQuestion("인천 구급 통계").args.sido).toBe("인천소방본부")
    expect(routeQuestion("대구 구급 통계").args.sido).toBe("대구소방안전본부")
    expect(routeQuestion("제주 구급 통계").args.sido).toBe("제주소방안전본부")
  })

  it("광주·전남 통합 전후의 소방본부명을 조회 월에 맞춘다", () => {
    expect(routeQuestion("광주 2025년 1월 구급 통계").args.sido).toBe("광주소방안전본부")
    expect(routeQuestion("전남 2025년 1월 구급 통계").args.sido).toBe("전남소방본부")
    expect(routeQuestion("광주 2026년 8월 구급 통계").args.sido).toBe("전남광주통합특별시소방본부")
    expect(routeQuestion("전남 202608 구급 통계").args.sido).toBe("전남광주통합특별시소방본부")
  })

  it("일자가 있는 구급 출동 질문을 화재통계로 오분류하지 않는다", () => {
    const r = routeQuestion("2025년 1월 3일 인천 구급 출동 통계")
    expect(r.tool).toBe("get_ems_stats")
    expect(r.args).toMatchObject({ sido: "인천소방본부", month: "202501" })
  })

  it("소방시설 + 시도 → 시설 현황 조회 ('소방시설법'과 혼동하지 않음)", () => {
    const r = routeQuestion("부산 스프링클러 설치된 건물")
    expect(r.tool).toBe("get_building_facilities")
    expect(r.args.sido).toBe("부산광역시")
  })

  it("시설 질문에서 건물명을 보존한다", () => {
    const r = routeQuestion("서울 호텔 스프링클러")
    expect(r.tool).toBe("get_building_facilities")
    expect(r.args).toMatchObject({ sido: "서울특별시", buildingName: "호텔" })
  })

  it("시설 질문의 종결어를 건물명으로 오인하지 않는다", () => {
    expect(routeQuestion("서울 호텔 스프링클러 있나").args.buildingName).toBe("호텔")
  })

  it("지역명과 겹치거나 다른 지역 글자가 든 건물명을 훼손하지 않는다", () => {
    expect(routeQuestion("서울 서울대학교병원 스프링클러").args.buildingName).toBe("서울대학교병원")
    expect(routeQuestion("서울 월드컵경기장 소방시설").args.buildingName).toBe("월드컵경기장")
  })

  it("특정소방대상물 질문에서 건물명을 보존한다", () => {
    const r = routeQuestion("서울 롯데타워 특정소방대상물")
    expect(r.tool).toBe("search_fire_building")
    expect(r.args).toMatchObject({ sido: "서울특별시", buildingName: "롯데타워" })
  })

  it("일자 없이 YYYY년 M월만 있는 구급 질문도 월을 인식한다", () => {
    const r = routeQuestion("서울 2025년 1월 교통사고 구급 통계")
    expect(r.tool).toBe("get_ems_stats")
    expect(r.args.month).toBe("202501")
  })

  it("애매한 질문 → 기본 법령 검색 (조회 없는 경로는 없다)", () => {
    const r = routeQuestion("소방차 길 막으면 어떻게 됨?")
    expect(r.tool).toBe("search_fire_law")
  })
})

describe("extractDate", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("여러 날짜 형식을 YYYYMMDD로 통일한다", () => {
    expect(extractDate("20250103 화재")).toBe("20250103")
    expect(extractDate("2025-01-03 화재")).toBe("20250103")
    expect(extractDate("2025.1.3 화재")).toBe("20250103")
    expect(extractDate("2025년 1월 3일")).toBe("20250103")
  })

  it("날짜 없으면 undefined", () => {
    expect(extractDate("화재 통계")).toBeUndefined()
  })

  it("달력에 없는 날짜는 날짜로 인정하지 않는다", () => {
    expect(extractDate("2025년 2월 30일 화재")).toBeUndefined()
    expect(extractDate("20251340 화재")).toBeUndefined()
  })

  it("서버가 UTC여도 오늘·어제는 한국 날짜로 계산한다", () => {
    const oldTz = process.env.TZ
    process.env.TZ = "UTC"
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-12T15:30:00Z")) // 한국 2026-08-13 00:30
    expect(extractDate("오늘 화재")).toBe("20260813")
    expect(extractDate("어제 화재")).toBe("20260812")
    if (oldTz === undefined) delete process.env.TZ
    else process.env.TZ = oldTz
  })
})
