import { describe, it, expect } from "vitest"
import { llmRoute } from "./llm-router.js"
import type { LlmAdapter } from "./llm-adapter.js"

function mock(reply: string): LlmAdapter {
  return { name: "mock", generate: async () => reply }
}

describe("llmRoute — LLM이 질문을 도구·인자로 변환, 모든 실패는 null(규칙 폴백)", () => {
  it("정상 JSON → 라우팅 결과 (개떡같은 질문도 스키마만 맞으면 통과)", async () => {
    const r = await llmRoute(
      "소방시설 제10",
      mock('{"tool":"get_fire_law_text","args":{"lawName":"소방시설법","jo":"제10조"}}')
    )
    expect(r?.tool).toBe("get_fire_law_text")
    expect(r?.args).toMatchObject({ lawName: "소방시설법", jo: "제10조" })
  })

  it("코드펜스·설명이 섞여도 JSON만 뽑는다", async () => {
    const r = await llmRoute(
      "질문",
      mock('선택 결과:\n```json\n{"tool":"search_fire_law","args":{"query":"소방기본법"}}\n```')
    )
    expect(r?.tool).toBe("search_fire_law")
  })

  it("미등록 도구 → null (LLM이 없는 도구를 지어내도 차단)", async () => {
    expect(await llmRoute("질문", mock('{"tool":"hack_tool","args":{}}'))).toBeNull()
  })

  it("인자 스키마 불일치 → null", async () => {
    expect(await llmRoute("질문", mock('{"tool":"search_fire_law","args":{"display":"많이"}}'))).toBeNull()
  })

  it("JSON 없는 응답·LLM 오류 → null", async () => {
    expect(await llmRoute("질문", mock("몰라요"))).toBeNull()
    const broken: LlmAdapter = {
      name: "broken",
      generate: async () => {
        throw new Error("down")
      },
    }
    expect(await llmRoute("질문", broken)).toBeNull()
  })

  it("라우팅 프롬프트에 도구 목록·법령 사전·오늘 날짜가 들어간다 (온톨로지 주입)", async () => {
    let sys = ""
    const spy: LlmAdapter = {
      name: "spy",
      generate: async (system) => {
        sys = system
        return "no json"
      },
    }
    await llmRoute("질문", spy)
    expect(sys).toContain("search_fire_stats")
    expect(sys).toContain("소방시설 설치 및 관리에 관한 법률")
    expect(sys).toContain("오늘")
  })
})
