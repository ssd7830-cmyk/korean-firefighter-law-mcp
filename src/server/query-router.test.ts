import { describe, it, expect } from "vitest"
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

  it("법령명만 → 법령 검색", () => {
    const r = routeQuestion("위험물안전관리법 검색해줘")
    expect(r.tool).toBe("search_fire_law")
  })

  it("판례 키워드 → 판례 검색 (법령명이 있어도 판례 우선)", () => {
    const r = routeQuestion("소방시설 점검 판례 찾아줘")
    expect(r.tool).toBe("search_fire_precedents")
    expect(String(r.args.query)).toContain("소방시설 점검")
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

  it("소방시설 + 시도 → 대상물 검색 ('소방시설법'과 혼동하지 않음)", () => {
    const r = routeQuestion("부산 스프링클러 설치된 건물")
    expect(r.tool).toBe("search_fire_building")
    expect(r.args.sido).toBe("부산광역시")
  })

  it("애매한 질문 → 기본 법령 검색 (조회 없는 경로는 없다)", () => {
    const r = routeQuestion("소방차 길 막으면 어떻게 됨?")
    expect(r.tool).toBe("search_fire_law")
  })
})

describe("extractDate", () => {
  it("여러 날짜 형식을 YYYYMMDD로 통일한다", () => {
    expect(extractDate("20250103 화재")).toBe("20250103")
    expect(extractDate("2025-01-03 화재")).toBe("20250103")
    expect(extractDate("2025.1.3 화재")).toBe("20250103")
    expect(extractDate("2025년 1월 3일")).toBe("20250103")
  })

  it("날짜 없으면 undefined", () => {
    expect(extractDate("화재 통계")).toBeUndefined()
  })
})
