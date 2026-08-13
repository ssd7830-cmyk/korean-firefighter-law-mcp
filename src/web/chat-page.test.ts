import { describe, it, expect } from "vitest"
import { CHAT_PAGE_HTML } from "./chat-page.js"

describe("챗봇 페이지 대화 격리", () => {
  it("요청 시작 당시 대화를 고정해 응답을 다른 대화에 넣지 않는다", () => {
    expect(CHAT_PAGE_HTML).toContain("const targetConv = convs[current]")
    expect(CHAT_PAGE_HTML).toContain("targetConv.msgs.push")
  })

  it("손상된 세션 저장소와 저장 용량 오류가 UI를 멈추지 않는다", () => {
    expect(CHAT_PAGE_HTML).toContain("try { convs = JSON.parse")
    expect(CHAT_PAGE_HTML).toContain("convs = convs.filter")
    expect(CHAT_PAGE_HTML).toContain("Array.isArray(c.msgs)")
    expect(CHAT_PAGE_HTML).toContain("try { sessionStorage.setItem")
    expect(CHAT_PAGE_HTML).not.toContain("localStorage")
  })

  it("직전 대화 문맥을 서버에 보내고 모바일·키보드 접근 경로를 제공한다", () => {
    expect(CHAT_PAGE_HTML).toContain("JSON.stringify({ message: text, history })")
    expect(CHAT_PAGE_HTML).toContain('id="menu" aria-label="대화 목록 열기"')
    expect(CHAT_PAGE_HTML).toContain('class="ex"')
    expect(CHAT_PAGE_HTML).toContain('aria-label="질문 보내기"')
  })

  it("AI 텍스트는 innerHTML 없이 안전한 Markdown 렌더러로 표시한다", () => {
    expect(CHAT_PAGE_HTML).toContain("renderSafeMarkdown")
    expect(CHAT_PAGE_HTML).not.toContain(".innerHTML = text")
  })

  it("보호된 챗봇 API에 Bearer 토큰을 보낼 수 있다", () => {
    expect(CHAT_PAGE_HTML).toContain('headers.Authorization = "Bearer " + chatToken')
    expect(CHAT_PAGE_HTML).toContain("sessionStorage")
  })
})
