import { describe, it, expect, vi, afterEach } from "vitest"
import { llmPlan, MAX_PLAN_CALLS } from "./llm-router.js"
import type { LlmAdapter } from "./llm-adapter.js"

function mock(reply: string): LlmAdapter {
  return { name: "mock", generate: async () => reply }
}

describe("llmPlan — LLM이 질문을 공식 API 호출 계획으로 변환, 모든 실패는 null", () => {
  afterEach(() => vi.useRealTimers())

  it("단일 호출 계획 (개떡같은 질문도 스키마만 맞으면 통과)", async () => {
    const r = await llmPlan(
      "소방시설 제10",
      mock('{"calls":[{"tool":"get_fire_law_text","args":{"lawName":"소방시설법","jo":"제10조"}}]}')
    )
    expect(r).toHaveLength(1)
    expect(r?.[0].tool).toBe("get_fire_law_text")
    expect(r?.[0].args).toMatchObject({ lawName: "소방시설법", jo: "제10조" })
  })

  it("복수 호출 계획 — 별표·NFPC·NFTC를 한 번에 (하드코딩 없이 LLM 판단)", async () => {
    const r = await llmPlan(
      "아파트 스프링클러 설치 기준",
      mock(JSON.stringify({
        calls: [
          { tool: "get_fire_law_annex", args: { lawName: "소방시설 설치 및 관리에 관한 법률 시행령", annex: "4", query: "공동주택" } },
          { tool: "get_fire_admin_rule_text", args: { ruleName: "NFPC 103" } },
          { tool: "get_fire_admin_rule_text", args: { ruleName: "NFTC 103" } },
        ],
      }))
    )
    expect(r?.map((c) => c.tool)).toEqual(["get_fire_law_annex", "get_fire_admin_rule_text", "get_fire_admin_rule_text"])
  })

  it("구형 단일 객체 {\"tool\":...} 응답도 1건 계획으로 수용한다", async () => {
    const r = await llmPlan("질문", mock('{"tool":"search_fire_law","args":{"query":"소방기본법"}}'))
    expect(r).toHaveLength(1)
    expect(r?.[0].tool).toBe("search_fire_law")
  })

  it("코드펜스·설명이 섞여도 JSON만 뽑는다", async () => {
    const r = await llmPlan(
      "질문",
      mock('계획:\n```json\n{"calls":[{"tool":"search_fire_law","args":{"query":"소방기본법"}}]}\n```')
    )
    expect(r?.[0].tool).toBe("search_fire_law")
  })

  it("문자열 안 중괄호와 뒤쪽 설명이 있어도 첫 JSON 객체만 안전하게 읽는다", async () => {
    const r = await llmPlan("질문", mock('앞말 {"calls":[{"tool":"search_fire_law","args":{"query":"{소방}"}}]} 뒷말 {깨짐}'))
    expect(r?.[0].args.query).toBe("{소방}")
  })

  it("직전 대화 문맥을 계획 프롬프트에 넣는다", async () => {
    let user = ""
    await llmPlan("그중 3번", { name: "spy", generate: async (_system, value) => {
      user = value
      return '{"calls":[{"tool":"search_fire_law","args":{"query":"소방"}}]}'
    } }, [{ role: "assistant", text: "1. A 2. B 3. C" }])
    expect(user).toContain("[직전 대화]")
    expect(user).toContain("3. C")
  })

  it("미등록 도구는 걸러지고, 유효한 호출이 하나도 없으면 null", async () => {
    expect(await llmPlan("질문", mock('{"calls":[{"tool":"hack_tool","args":{}}]}'))).toBeNull()
  })

  it("유효·무효 호출이 섞이면 유효한 호출만 남긴다", async () => {
    const r = await llmPlan(
      "질문",
      mock('{"calls":[{"tool":"hack_tool","args":{}},{"tool":"search_fire_law","args":{"query":"소방"}},{"tool":"search_fire_law","args":{"display":"많이"}}]}')
    )
    expect(r).toHaveLength(1)
    expect(r?.[0].tool).toBe("search_fire_law")
  })

  it("상한을 넘는 계획은 앞에서부터 절단한다", async () => {
    const calls = Array.from({ length: MAX_PLAN_CALLS + 3 }, (_, i) => ({
      tool: "search_fire_law", args: { query: `소방${i}` },
    }))
    const r = await llmPlan("질문", mock(JSON.stringify({ calls })))
    expect(r).toHaveLength(MAX_PLAN_CALLS)
    expect(r?.[0].args.query).toBe("소방0")
  })

  it("JSON 없는 응답·LLM 오류 → null", async () => {
    expect(await llmPlan("질문", mock("몰라요"))).toBeNull()
    const broken: LlmAdapter = {
      name: "broken",
      generate: async () => {
        throw new Error("down")
      },
    }
    expect(await llmPlan("질문", broken)).toBeNull()
  })

  it("계획 프롬프트에 도구 목록·법령 사전·복수 조회 지식·오늘 날짜가 들어간다 (온톨로지 주입)", async () => {
    let sys = ""
    const spy: LlmAdapter = {
      name: "spy",
      generate: async (system) => {
        sys = system
        return "no json"
      },
    }
    await llmPlan("질문", spy)
    expect(sys).toContain("search_fire_stats")
    expect(sys).toContain("소방시설 설치 및 관리에 관한 법률")
    expect(sys).toContain("오늘")
    expect(sys).toContain("인천소방본부")
    expect(sys).toContain("전남광주통합특별시소방본부")
    // 설치 기준 질문에서 별표+NFPC+NFTC를 함께 계획하라는 판단 재료
    expect(sys).toContain("get_fire_law_annex")
    expect(sys).toContain("NFPC")
    expect(sys).toContain("NFTC")
  })

  it("계획 기준일은 UTC 서버에서도 한국 날짜다", async () => {
    const oldTz = process.env.TZ
    process.env.TZ = "UTC"
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-12T15:30:00Z"))
    let sys = ""
    await llmPlan("오늘 화재", {
      name: "spy",
      generate: async (system) => {
        sys = system
        return "no json"
      },
    })
    expect(sys).toContain("오늘: 2026-08-13")
    if (oldTz === undefined) delete process.env.TZ
    else process.env.TZ = oldTz
  })
})
