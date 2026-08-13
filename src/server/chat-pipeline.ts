/**
 * 챗봇 파이프라인 — 할루시네이션 차단 구조
 *
 * 질문 → ① 무조건 조회 (코드가 강제, AI 판단 개입 없음)
 *       → ② 조회 결과를 LLM에 자료로 전달, "자료 안에서만 답하라" 강제
 *       → ③ LLM 키 없으면 조회 결과 원문 그대로 반환 (조회 모드)
 *
 * 자료 없이 답변이 생성되는 경로는 존재하지 않는다.
 */

import { allTools, type Clients } from "../tool-registry.js"
import { routeQuestion } from "./query-router.js"
import type { LlmAdapter } from "./llm-adapter.js"

export interface ChatResult {
  answer: string
  mode: "llm" | "lookup"
  tool: string
}

const GROUNDING_SYSTEM = `너는 소방공무원을 돕는 상담 도우미다.
사용자 질문과 함께 [조회된 자료]가 주어진다. 이 자료는 소방청 공공데이터와 법제처 국가법령정보에서 방금 조회한 공식 데이터다.

규칙:
1. 반드시 [조회된 자료] 안의 내용만으로 답한다. 자료에 없는 내용은 추측하지 말고 "조회된 자료에서 확인되지 않습니다"라고 말한다.
2. 조문 번호, 날짜, 수치는 자료에 있는 그대로 인용한다.
3. 답변은 간결하게, 소방 실무자가 바로 쓸 수 있는 형태로 쓴다.
4. 답변 마지막 줄에 "출처: "로 시작하는 한 줄로 자료 출처(법령명·조문 또는 통계 종류)를 표기한다.`

export async function handleChat(
  message: string,
  clients: Clients,
  adapter: LlmAdapter | null
): Promise<ChatResult> {
  const route = routeQuestion(message)
  const tool = allTools.find((t) => t.name === route.tool)
  if (!tool) {
    return { answer: "질문을 처리할 도구를 찾지 못했습니다.", mode: "lookup", tool: "none" }
  }

  // ① 무조건 조회 — 실패하면 답변 생성 없이 오류 안내
  let retrieved: string
  try {
    const result = await tool.handler(clients, route.args)
    retrieved = result.content.map((c) => c.text).join("\n")
    if (result.isError) {
      return { answer: retrieved, mode: "lookup", tool: route.tool }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { answer: `조회 중 오류가 발생했습니다: ${msg}`, mode: "lookup", tool: route.tool }
  }

  // ③ LLM 미연결 → 조회 결과 원문 (조회 모드)
  if (!adapter) {
    return { answer: retrieved, mode: "lookup", tool: route.tool }
  }

  // ② 자료 기반 답변 생성 — LLM 실패 시에도 조회 결과는 반환
  try {
    const answer = await adapter.generate(
      GROUNDING_SYSTEM,
      `질문: ${message}\n\n[조회된 자료]\n${retrieved}`
    )
    return { answer, mode: "llm", tool: route.tool }
  } catch {
    return {
      answer: `(AI 답변 생성에 실패해 조회 결과 원문을 표시합니다)\n\n${retrieved}`,
      mode: "lookup",
      tool: route.tool,
    }
  }
}
