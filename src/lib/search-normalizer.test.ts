import { describe, it, expect } from "vitest"
import { joLabel, resolveFireLawAlias, toJoCode, FIRE_LAWS } from "./search-normalizer.js"

describe("resolveFireLawAlias", () => {
  it("약칭을 정식 명칭으로 변환한다", () => {
    expect(resolveFireLawAlias("화재예방법")).toBe("화재의 예방 및 안전관리에 관한 법률")
    expect(resolveFireLawAlias("소방시설법")).toBe("소방시설 설치 및 관리에 관한 법률")
    expect(resolveFireLawAlias("위험물법")).toBe("위험물안전관리법")
    expect(resolveFireLawAlias("119법")).toBe("119구조ㆍ구급에 관한 법률")
  })

  it("복합 입력에서 본법 별칭만 치환한다", () => {
    expect(resolveFireLawAlias("화재예방법 시행령")).toBe("화재의 예방 및 안전관리에 관한 법률 시행령")
    expect(resolveFireLawAlias("소방시설법 시행규칙")).toBe("소방시설 설치 및 관리에 관한 법률 시행규칙")
  })

  it("별칭이 아니면 그대로 반환한다", () => {
    expect(resolveFireLawAlias("소방기본법")).toBe("소방기본법")
    expect(resolveFireLawAlias("건축법")).toBe("건축법")
  })

  it("소방 법령 프리셋에 핵심 6법이 있다", () => {
    for (const name of ["소방기본법", "소방시설공사업법", "위험물안전관리법", "소방공무원법"]) {
      expect(FIRE_LAWS).toContain(name)
    }
  })
})

describe("toJoCode", () => {
  it("조번호를 JO 6자리 코드로 변환한다", () => {
    expect(toJoCode("10")).toBe("001000")
    expect(toJoCode("제10조")).toBe("001000")
    expect(toJoCode("10의2")).toBe("001002")
    expect(toJoCode("제10조의2")).toBe("001002")
    expect(toJoCode("2")).toBe("000200")
  })

  it("해석 불가 형식은 명확한 에러", () => {
    expect(() => toJoCode("십조")).toThrow("조번호 형식")
  })
})

describe("joLabel", () => {
  it("조번호 입력 형식과 무관하게 표시는 '제N조(의M)'로 통일한다", () => {
    expect(joLabel("10")).toBe("제10조")
    expect(joLabel("제10조")).toBe("제10조")
    expect(joLabel("10의2")).toBe("제10조의2")
    expect(joLabel("제 10 조")).toBe("제10조")
  })

  it("해석 불가 형식은 입력 그대로 반환한다", () => {
    expect(joLabel("십조")).toBe("십조")
  })
})

describe("의도: 실무자 입력 관용 (빨간불 사냥)", () => {
  it("별칭 안에 띄어쓰기가 있어도 올바르게 해석한다", () => {
    // 실무자는 "화재 예방법"처럼 띄어 쓰기도 한다
    expect(resolveFireLawAlias("화재 예방법 시행령")).toBe("화재의 예방 및 안전관리에 관한 법률 시행령")
    expect(resolveFireLawAlias("소방 시설법")).toBe("소방시설 설치 및 관리에 관한 법률")
  })

  it("조번호에 띄어쓰기가 있어도 해석한다", () => {
    expect(toJoCode("제 10 조")).toBe("001000")
    expect(toJoCode("제10 조의 2")).toBe("001002")
  })
})
