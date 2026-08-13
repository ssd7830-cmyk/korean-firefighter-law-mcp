import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { handleChat } from "./chat-pipeline.js"
import { createLlmAdapter, type LlmAdapter } from "./llm-adapter.js"
import { createClients } from "./factory.js"

const LAW_XML = "<LawSearch><law><법령명한글>소방기본법</법령명한글><법령일련번호>1</법령일련번호><소관부처명>소방청</소관부처명><시행일자>20240101</시행일자></law></LawSearch>"

describe("chat-pipeline — 무조건 조회 구조", () => {
  beforeEach(() => {
    process.env.LAW_OC = "testoc"
    vi.stubGlobal("fetch", vi.fn(async () => new Response(LAW_XML, { status: 200 })))
  })
  afterEach(() => {
    delete process.env.LAW_OC
    vi.unstubAllGlobals()
  })

  it("LLM 없으면 조회 결과 원문을 반환한다 (조회 모드)", async () => {
    const result = await handleChat("소방기본법 검색", createClients(), null)
    expect(result.mode).toBe("lookup")
    expect(result.tool).toBe("search_fire_law")
    expect(result.answer).toContain("소방기본법")
  })

  it("대시보드 자연어 설치 기준 질문을 행정규칙 조회까지 연결한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          "<AdmRulSearch><admrul><행정규칙명>스프링클러설비의 화재안전성능기준(NFPC 103)</행정규칙명><행정규칙종류>고시</행정규칙종류><소관부처명>소방청</소관부처명><발령일자>20251224</발령일자></admrul></AdmRulSearch>",
          { status: 200 }
        )
      )
    )
    const result = await handleChat(
      "firefighter-law MCP로 아파트 스프링클러 설치 기준 찾아줘",
      createClients(),
      null
    )
    expect(result.mode).toBe("lookup")
    expect(result.tool).toBe("search_fire_admin_rules")
    expect(result.answer).toContain("NFPC 103")
    expect((fetch as any).mock.calls[0][0]).toContain("query=%EC%8A%A4%ED%94%84%EB%A7%81%ED%81%B4%EB%9F%AC")
  })

  it("LLM이 있어도 조회가 먼저다 — 조회 결과가 자료로 LLM에 전달된다", async () => {
    let receivedUser = ""
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (_system, user) => {
        receivedUser = user
        return "자료 기반 답변입니다. 출처: 소방기본법"
      },
    }
    const result = await handleChat("소방기본법 검색", createClients(), fake)
    expect(result.mode).toBe("llm")
    expect(receivedUser).toContain("[조회된 자료]")
    expect(receivedUser).toContain("소방기본법") // 조회 결과가 실제로 자료에 들어감
    expect(result.answer).toContain("자료 기반 답변")
    expect(result.answer).toContain("[공식 조회 원문]")
    expect(result.answer).toContain("소방기본법")
  })

  it("LLM 생성이 실패해도 조회 결과는 반환된다 (답변 증발 금지)", async () => {
    const broken: LlmAdapter = {
      name: "broken",
      generate: async () => {
        throw new Error("LLM down")
      },
    }
    const result = await handleChat("소방기본법 검색", createClients(), broken)
    expect(result.mode).toBe("lookup")
    expect(result.answer).toContain("소방기본법")
  })

  it("조회 자체가 실패하면 오류 안내를 반환하고, 자료 없는 답변 생성 호출은 없다", async () => {
    delete process.env.LAW_OC // 키 없음 → 조회 실패
    const generate = vi.fn(async () => "{}")
    const result = await handleChat("소방기본법 검색", createClients(), { name: "x", generate })
    expect(result.answer).toContain("LAW_OC")
    // 라우팅 호출은 허용 — 단 [조회된 자료] 없이 답변을 생성하는 호출은 없어야 한다
    for (const call of generate.mock.calls) expect(String(call[1])).not.toContain("[조회된 자료]")
  })

  it("조회 예외에 인증키 URL이 들어와도 사용자 답변에서는 가린다", async () => {
    const clients = createClients()
    clients.law.search = vi.fn(async () => {
      throw new Error("https://example.test?OC=real-secret&query=소방")
    })
    const result = await handleChat("소방기본법 검색", clients, null)
    expect(result.answer).toContain("OC=***")
    expect(result.answer).not.toContain("real-secret")
  })

  it("LLM 라우터가 도구를 고르면 그 도구로 조회한다 (개떡→찰떡 라우팅)", async () => {
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (system) =>
        system.includes("라우터")
          ? '{"tool":"search_fire_precedents","args":{"query":"소방"}}'
          : "자료 기반 답변. 출처: 판례",
    }
    const result = await handleChat("아무렇게나 쓴 질문", createClients(), fake)
    expect(result.tool).toBe("search_fire_precedents")
  })
})

describe("createLlmAdapter — provider 선택", () => {
  const KEYS = ["LLM_PROVIDER", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]
  beforeEach(() => KEYS.forEach((k) => delete process.env[k]))
  afterEach(() => KEYS.forEach((k) => delete process.env[k]))

  it("키가 하나도 없으면 null (조회 모드)", () => {
    expect(createLlmAdapter()).toBeNull()
  })

  it("GEMINI_API_KEY만 있으면 gemini 자동 선택", () => {
    process.env.GEMINI_API_KEY = "g"
    expect(createLlmAdapter()?.name).toBe("gemini")
  })

  it("LLM_PROVIDER 명시가 자동 감지보다 우선한다", () => {
    process.env.GEMINI_API_KEY = "g"
    process.env.OPENAI_API_KEY = "o"
    process.env.LLM_PROVIDER = "openai"
    expect(createLlmAdapter()?.name).toBe("openai")
  })

  it("잘못된 provider나 누락된 provider 키는 시작 설정 오류로 거부한다", () => {
    process.env.LLM_PROVIDER = "unknown"
    expect(() => createLlmAdapter()).toThrow("LLM_PROVIDER")
    process.env.LLM_PROVIDER = "gemini"
    expect(() => createLlmAdapter()).toThrow("GEMINI_API_KEY")
  })

  it("gemini 어댑터는 응답 텍스트를 합쳐 반환한다", async () => {
    process.env.GEMINI_API_KEY = "g"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "답변 " }, { text: "본문" }] } }] }),
          { status: 200 }
        )
      )
    )
    const adapter = createLlmAdapter()!
    expect(await adapter.generate("sys", "user")).toBe("답변 본문")
    expect((fetch as any).mock.calls[0][0]).toContain("/models/gemini-3.6-flash:")
    const init = (fetch as any).mock.calls[0][1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    vi.unstubAllGlobals()
  })

  it("openai 어댑터는 Responses API와 현행 기본 모델을 사용한다", async () => {
    process.env.OPENAI_API_KEY = "o"
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            output: [{ type: "message", content: [{ type: "output_text", text: "답변" }] }],
          }),
          { status: 200 }
        )
      )
    )
    const adapter = createLlmAdapter()!
    expect(await adapter.generate("sys", "user")).toBe("답변")
    const [url, init] = (fetch as any).mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.openai.com/v1/responses")
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "gpt-5.6-luna",
      instructions: "sys",
      input: "user",
    })
    vi.unstubAllGlobals()
  })
})
