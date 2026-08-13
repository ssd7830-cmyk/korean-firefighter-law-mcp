import { describe, it, expect } from "vitest"
import { collectText } from "./fire-law.js"

describe("collectText — 조문 트리 평탄화 의도", () => {
  it("조문내용→항→호 순서로 전부 수집한다", () => {
    const unit = {
      조문번호: "10",
      조문여부: "조문",
      조문내용: "제10조(소방시설의 설치)",
      항: [
        {
          항내용: "① 특정소방대상물의 관계인은 소방시설을 설치하여야 한다.",
          호: [{ 호내용: "1. 소화설비" }, { 호내용: "2. 경보설비" }],
        },
        { 항내용: "② 제1항에 따른 기준은 대통령령으로 정한다." },
      ],
    }
    const out: string[] = []
    collectText(unit, out)
    expect(out).toEqual([
      "제10조(소방시설의 설치)",
      "① 특정소방대상물의 관계인은 소방시설을 설치하여야 한다.",
      "1. 소화설비",
      "2. 경보설비",
      "② 제1항에 따른 기준은 대통령령으로 정한다.",
    ])
  })

  it("항이 단일 객체(비배열)여도 수집한다", () => {
    const out: string[] = []
    collectText({ 조문내용: "제1조(목적)", 항: { 항내용: "본문" } }, out)
    expect(out).toEqual(["제1조(목적)", "본문"])
  })

  it("조문번호 등 메타 필드는 본문에 섞지 않는다", () => {
    const out: string[] = []
    collectText({ 조문번호: "3", 조문내용: "제3조" }, out)
    expect(out).toEqual(["제3조"])
  })
})
