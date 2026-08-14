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

  it("계획이 실패하면 추측 조회 없이 안내를 반환한다 (규칙 폴백 없음)", async () => {
    const noPlan: LlmAdapter = { name: "fake", generate: async () => "도구를 못 고르겠습니다" }
    const result = await handleChat("소방기본법 검색", createClients(), noPlan)
    expect(result.tool).toBe("routing")
    expect(result.answer).toContain("변환하지 못했습니다")
    expect((fetch as any).mock.calls.length).toBe(0) // 정부 API 추측 조회가 없어야 한다
  })

  it("아파트 설치 질문은 시행령 별표·NFPC·NFTC 원문을 함께 조회한다", async () => {
    const clients = createClients()
    clients.law.search = vi.fn(async (target, query) => target === "law"
      ? { LawSearch: { law: { 법령명한글: "소방시설 설치 및 관리에 관한 법률 시행령", 법령일련번호: "1" } } }
      : { AdmRulSearch: { admrul: {
          행정규칙명: query.includes("NFTC") ? "스프링클러설비의 화재안전기술기준(NFTC 103)" : "스프링클러설비의 화재안전성능기준(NFPC 103)",
          행정규칙일련번호: query.includes("NFTC") ? "3" : "2",
        } } })
    clients.law.service = vi.fn(async (target, params) => target === "law"
      ? { 법령: { 기본정보: { 법령명_한글: "소방시설 설치 및 관리에 관한 법률 시행령" }, 별표: { 별표단위: { 별표번호: "0004", 별표내용: "공동주택에는 스프링클러설비를 설치한다" } } } }
      : { AdmRulService: { 행정규칙기본정보: { 행정규칙명: params.ID === "3" ? "NFTC 103" : "NFPC 103" }, 조문내용: params.ID === "3" ? "NFTC 103 배관 설치 기준" : "NFPC 103 성능 기준" } })
    // 하드코딩 없이 LLM이 3개 호출을 스스로 계획하고, 세 자료가 모두 병합·인용된다
    const planner: LlmAdapter = {
      name: "fake",
      generate: async (system) =>
        system.includes("계획기")
          ? JSON.stringify({
              calls: [
                { tool: "get_fire_law_annex", args: { lawName: "소방시설 설치 및 관리에 관한 법률 시행령", annex: "4", query: "공동주택" } },
                { tool: "get_fire_admin_rule_text", args: { ruleName: "NFPC 103" } },
                { tool: "get_fire_admin_rule_text", args: { ruleName: "NFTC 103" } },
              ],
            })
          : "공동주택은 스프링클러 설치 대상이다 [자료 1]. 성능기준은 NFPC 103 [자료 2], 기술기준은 NFTC 103이다 [자료 3].",
    }
    const result = await handleChat(
      "firefighter-law MCP로 아파트 스프링클러 설치 기준 찾아줘",
      clients,
      planner
    )
    expect(result.mode).toBe("llm")
    expect(result.tool).toContain("get_fire_law_annex")
    expect(result.tool).toContain("get_fire_admin_rule_text")
    expect(result.answer).toContain("[자료 1]")
    expect(result.answer).toContain("[자료 3]")
    expect(result.answer).toContain("NFPC 103")
    expect(result.answer).toContain("NFTC 103")
    expect(result.answer).toContain("공동주택")
  })

  it("LLM이 있어도 조회가 먼저다 — 조회 결과가 자료로 LLM에 전달된다", async () => {
    let receivedUser = ""
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (system, user) => {
        receivedUser = user
        return system.includes("계획기")
          ? '{"calls":[{"tool":"search_fire_law","args":{"query":"소방기본법"}}]}'
          : "조회된 자료에 소방기본법이 있습니다 [자료 1]."
      },
    }
    const result = await handleChat("소방기본법 검색", createClients(), fake)
    expect(result.mode).toBe("llm")
    expect(receivedUser).toContain("[조회된 자료]")
    expect(receivedUser).toContain("소방기본법") // 조회 결과가 실제로 자료에 들어감
    expect(result.answer).toContain("[자료 1]") // 주장에 근거 번호 인용
    expect(result.answer).toContain("[공식 조회 자료]") // 원문 병기
    expect(result.answer).toContain("소방기본법")
  })

  it("답변 생성이 실패해도 조회 결과는 반환된다 (답변 증발 금지)", async () => {
    const broken: LlmAdapter = {
      name: "broken",
      generate: async (system) => {
        if (system.includes("계획기")) return '{"calls":[{"tool":"search_fire_law","args":{"query":"소방기본법"}}]}'
        throw new Error("LLM down") // 계획은 성공, 답변 생성만 실패
      },
    }
    const result = await handleChat("소방기본법 검색", createClients(), broken)
    expect(result.mode).toBe("lookup")
    expect(result.answer).toContain("소방기본법")
  })

  const singlePlan = '{"calls":[{"tool":"search_fire_law","args":{"query":"소방기본법"}}]}'

  it("인용 없는 답변은 폐기하고 공식 원문으로 폴백한다", async () => {
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (system) => system.includes("계획기") ? singlePlan : "인용 없이 아무렇게나 쓴 답변",
    }
    const result = await handleChat("소방기본법 검색", createClients(), fake)
    expect(result.mode).toBe("lookup")
    expect(result.answer).not.toContain("아무렇게나 쓴 답변")
    expect(result.answer).toContain("소방기본법")
  })

  it("존재하지 않는 자료 번호를 인용하면 폐기하고 공식 원문으로 폴백한다", async () => {
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (system) => system.includes("계획기") ? singlePlan : "지어낸 주장입니다 [자료 7]",
    }
    const result = await handleChat("소방기본법 검색", createClients(), fake)
    expect(result.mode).toBe("lookup")
    expect(result.answer).not.toContain("지어낸 주장")
    expect(result.answer).toContain("소방기본법")
  })

  it("일부 문장에만 인용한 답변은 전체를 폐기하고 공식 원문으로 폴백한다", async () => {
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (system) => system.includes("계획기")
        ? singlePlan
        : "근거 없는 추가 주장입니다. 소방기본법 검색 결과가 있습니다 [자료 1].",
    }
    const result = await handleChat("소방기본법 검색", createClients(), fake)
    expect(result.mode).toBe("lookup")
    expect(result.answer).not.toContain("근거 없는 추가 주장")
    expect(result.answer).toContain("소방기본법")
  })

  it("긴 복수 조회도 모든 자료 번호와 본문을 LLM에 전달한다", async () => {
    const clients = createClients()
    clients.law.service = vi.fn(async (_target, params) => ({
      법령: {
        기본정보: { 법령명_한글: `법령-${params.MST}` },
        조문: { 조문단위: { 조문내용: `${params.MST}-본문-${"가".repeat(9_000)}` } },
      },
    }))
    let answerInput = ""
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (system, user) => {
        if (system.includes("계획기")) {
          return JSON.stringify({
            calls: ["1", "2", "3", "4"].map((mst) => ({ tool: "get_fire_law_text", args: { mst } })),
          })
        }
        answerInput = user
        return "네 번째 공식 자료도 확인했습니다 [자료 4]."
      },
    }
    const result = await handleChat("네 법령을 비교해줘", clients, fake)
    expect(answerInput).toContain("[자료 4]")
    expect(answerInput).toContain("4-본문")
    expect(result.mode).toBe("llm")
  })

  it("복수 호출 중 일부가 실패하면 성공분만으로 답하고 실패를 표시한다", async () => {
    const clients = createClients()
    clients.fire.call = vi.fn(async () => {
      throw new Error("소방청 API 점검 중")
    })
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (system) =>
        system.includes("계획기")
          ? '{"calls":[{"tool":"search_fire_law","args":{"query":"소방기본법"}},{"tool":"search_hazmat","args":{"query":"아세톤"}}]}'
          : "소방기본법 검색 결과가 있습니다 [자료 1].",
    }
    const result = await handleChat("소방기본법이랑 아세톤 알려줘", clients, fake)
    expect(result.mode).toBe("llm")
    expect(result.tool).toBe("search_fire_law")
    expect(result.answer).toContain("[자료 1]")
    expect(result.answer).toContain("일부 조회 실패: search_hazmat")
  })

  const untouched: LlmAdapter = {
    name: "unused",
    generate: async () => {
      throw new Error("이 경로에서는 LLM을 호출하면 안 된다")
    },
  }

  it("이전 문맥 없는 지시어 질문은 LLM·조회 없이 대상을 다시 묻는다", async () => {
    const result = await handleChat("그중 3번 알려줘", createClients(), untouched)
    expect(result.tool).toBe("context")
    expect(result.answer).toContain("이전 대화")
  })

  it("존재하지 않는 날짜는 LLM 라우팅 전에 거부된다", async () => {
    const result = await handleChat("2025년 2월 30일 화재", createClients(), untouched)
    expect(result.tool).toBe("validation")
    expect(result.answer).toContain("유효하지 않은 날짜")
  })

  it("조회 자체가 실패하면 오류 안내를 반환하고, 자료 없는 답변 생성 호출은 없다", async () => {
    delete process.env.LAW_OC // 키 없음 → 조회 실패
    const generate = vi.fn(async (system: string) =>
      system.includes("계획기") ? '{"calls":[{"tool":"search_fire_law","args":{"query":"소방기본법"}}]}' : "{}"
    )
    const result = await handleChat("소방기본법 검색", createClients(), { name: "x", generate })
    expect(result.answer).toContain("LAW_OC")
    // 라우팅 호출은 허용 — 단 [조회된 자료] 없이 답변을 생성하는 호출은 없어야 한다
    for (const call of generate.mock.calls) expect(String(call[1])).not.toContain("[조회된 자료]")
  })

  it("검색 0건도 LLM 답변 근거로 넘기지 않는다", async () => {
    const clients = createClients()
    clients.fire.call = vi.fn(async () => ({ items: { item: [{ chemicalname: "아세톤", casno: "67-64-1" }] } }))
    const generate = vi.fn(async () => '{"tool":"search_hazmat","args":{"query":"없는물질"}}')
    const result = await handleChat("없는물질 위험물이야?", clients, { name: "fake", generate })
    expect(result.mode).toBe("lookup")
    expect(result.answer).toContain("검색 결과 없음")
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it("조회 예외에 인증키 URL이 들어와도 사용자 답변에서는 가린다", async () => {
    const clients = createClients()
    clients.law.search = vi.fn(async () => {
      throw new Error("https://example.test?OC=real-secret&query=소방")
    })
    const routeOnly: LlmAdapter = { name: "fake", generate: async () => '{"tool":"search_fire_law","args":{"query":"소방"}}' }
    const result = await handleChat("소방기본법 검색", clients, routeOnly)
    expect(result.answer).toContain("OC=***")
    expect(result.answer).not.toContain("real-secret")
  })

  it("LLM 계획기가 도구를 고르면 그 도구로 조회한다 (개떡→찰떡 라우팅)", async () => {
    const fake: LlmAdapter = {
      name: "fake",
      generate: async (system) =>
        system.includes("계획기")
          ? '{"calls":[{"tool":"search_fire_precedents","args":{"query":"소방"}}]}'
          : "판례가 있습니다 [자료 1]",
    }
    const result = await handleChat("아무렇게나 쓴 질문", createClients(), fake)
    expect(result.tool).toBe("search_fire_precedents")
  })
})

describe("createLlmAdapter — provider 선택", () => {
  const KEYS = ["LLM_PROVIDER", "LLM_MODEL", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY", "CLAUDE_CLI_PATH", "CODEX_CLI_PATH"]
  beforeEach(() => KEYS.forEach((k) => delete process.env[k]))
  afterEach(() => KEYS.forEach((k) => delete process.env[k]))

  it("키가 하나도 없으면 null (HTTP 챗봇 비활성)", () => {
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

  it("claude-cli는 API 키 없이 선택된다 (로컬 구독 사용)", () => {
    process.env.LLM_PROVIDER = "claude-cli"
    expect(createLlmAdapter()?.name).toBe("claude-cli")
    expect(createLlmAdapter()?.model).toBe("claude-sonnet-5")
  })

  it("codex-cli는 로컬 로그인과 명시적 모델로 선택된다", () => {
    process.env.LLM_PROVIDER = "codex-cli"
    expect(createLlmAdapter()).toMatchObject({ name: "codex-cli", model: "gpt-5.6-sol" })
  })

  it("claude-cli는 자동 감지 대상이 아니다 (명시했을 때만 쓴다)", () => {
    expect(createLlmAdapter()).toBeNull() // 키·provider 없음 → 챗봇 비활성
  })

  it("claude-cli 실행 파일이 없으면 설치 확인 안내를 준다", async () => {
    process.env.LLM_PROVIDER = "claude-cli"
    process.env.CLAUDE_CLI_PATH = "/nonexistent/claude-binary"
    const adapter = createLlmAdapter()!
    await expect(adapter.generate("sys", "user")).rejects.toThrow("Claude Code CLI를 찾지 못했습니다")
    delete process.env.CLAUDE_CLI_PATH
  })

  it("codex-cli 실행 파일이 없으면 설치 확인 안내를 준다", async () => {
    process.env.LLM_PROVIDER = "codex-cli"
    process.env.CODEX_CLI_PATH = "/nonexistent/codex-binary"
    await expect(createLlmAdapter()!.generate("sys", "user")).rejects.toThrow("Codex CLI를 찾지 못했습니다")
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
