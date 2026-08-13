import { describe, it, expect } from "vitest"
import { maskSensitiveUrl } from "./fetch-with-retry.js"

describe("maskSensitiveUrl", () => {
  it("serviceKey와 OC를 마스킹한다", () => {
    expect(maskSensitiveUrl("https://apis.data.go.kr/x?serviceKey=SECRET123&pageNo=1")).toBe(
      "https://apis.data.go.kr/x?serviceKey=***&pageNo=1"
    )
    expect(maskSensitiveUrl("https://www.law.go.kr/DRF/lawSearch.do?OC=mykey&target=law")).toBe(
      "https://www.law.go.kr/DRF/lawSearch.do?OC=***&target=law"
    )
  })

  it("키가 없는 URL은 그대로", () => {
    const url = "https://apis.data.go.kr/x?pageNo=1"
    expect(maskSensitiveUrl(url)).toBe(url)
  })
})
