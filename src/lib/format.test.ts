import { describe, it, expect } from "vitest"
import { formatBody, filterBodyByKeyword, truncate } from "./format.js"

describe("formatBody", () => {
  it("단일 객체 item(XML 변환 특성)도 1건으로 출력한다", () => {
    const body = { items: { item: { name: "서울소방서", cnt: "3" } }, totalCount: "1" }
    const text = formatBody(body, "제목")
    expect(text).toContain("조회 1건")
    expect(text).toContain("서울소방서")
  })

  it("값이 0인 필드는 누락시키지 않는다 (0건도 정보다)", () => {
    const body = { items: { item: [{ 사망: 0, 부상: 2 }] }, totalCount: 1 }
    const text = formatBody(body, "제목")
    expect(text).toContain("사망: 0")
  })

  it("결과 없음이면 파라미터 확인 안내를 준다", () => {
    const text = formatBody({ items: {}, totalCount: 0 }, "제목")
    expect(text).toContain("결과 없음")
    expect(text).toContain("확인")
  })
})

describe("filterBodyByKeyword", () => {
  it("키워드로 필터하고 totalCount는 필터 후 개수를 반영한다", () => {
    const body = {
      items: { item: [{ 대상물명: "롯데타워" }, { 대상물명: "시청사" }, { 대상물명: "롯데백화점" }] },
      totalCount: "3000", // 원본 API 전체건수 — 필터 후에는 이 값이 나오면 안 된다
    }
    const filtered = filterBodyByKeyword(body, "롯데")
    expect(filtered.totalCount).toBe(2)
    const text = formatBody(filtered, "제목")
    expect(text).toContain("조회 2건")
    expect(text).not.toContain("시청사")
  })

  it("매칭 없으면 빈 결과 (0건)", () => {
    const body = { items: { item: [{ 대상물명: "시청사" }] }, totalCount: 1 }
    expect(filterBodyByKeyword(body, "없는건물").totalCount).toBe(0)
  })
})

describe("truncate", () => {
  it("한도 초과 시 자르고 좁혀서 조회하라는 안내를 붙인다", () => {
    const text = truncate("가".repeat(9000))
    expect(text.length).toBeLessThan(9000)
    expect(text).toContain("생략")
  })
})
