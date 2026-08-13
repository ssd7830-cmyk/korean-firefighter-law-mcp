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

  it("조회 자체가 실패하면 오류 안내를 반환하고 LLM은 호출하지 않는다", async () => {
    delete process.env.LAW_OC // 키 없음 → 조회 실패
    const generate = vi.fn()
    const result = await handleChat("소방기본법 검색", createClients(), { name: "x", generate })
    expect(result.answer).toContain("LAW_OC")
    expect(generate).not.toHaveBeenCalled() // 자료 없이 답변 생성 경로 차단
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
    vi.unstubAllGlobals()
  })
})
