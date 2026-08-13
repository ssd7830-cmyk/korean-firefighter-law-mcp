import { describe, it, expect } from "vitest"
import { CHAT_PAGE_HTML } from "./chat-page.js"

describe("챗봇 페이지 대화 격리", () => {
  it("요청 시작 당시 대화를 고정해 응답을 다른 대화에 넣지 않는다", () => {
    expect(CHAT_PAGE_HTML).toContain("const targetConv = convs[current]")
    expect(CHAT_PAGE_HTML).toContain("targetConv.msgs.push")
  })

  it("손상된 localStorage와 저장 용량 오류가 UI를 멈추지 않는다", () => {
    expect(CHAT_PAGE_HTML).toContain("try { convs = JSON.parse")
    expect(CHAT_PAGE_HTML).toContain("convs = convs.filter")
    expect(CHAT_PAGE_HTML).toContain("Array.isArray(c.msgs)")
    expect(CHAT_PAGE_HTML).toContain("try { localStorage.setItem")
  })

  it("보호된 챗봇 API에 Bearer 토큰을 보낼 수 있다", () => {
    expect(CHAT_PAGE_HTML).toContain('headers.Authorization = "Bearer " + chatToken')
    expect(CHAT_PAGE_HTML).toContain("sessionStorage")
  })
})
