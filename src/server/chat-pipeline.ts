/** 질문을 공식 API 조회로 먼저 근거화한 뒤, LLM에는 근거 문장 선택만 허용한다. */
import { allTools, type Clients } from "../tool-registry.js"
import { maskSensitiveUrl } from "../lib/fetch-with-retry.js"
import { extractFirstJsonObject } from "../lib/json-extract.js"
import { truncate } from "../lib/format.js"
import { questionValidationError, routeQuestion, type RoutedQuery } from "./query-router.js"
import { llmRoute } from "./llm-router.js"
import type { LlmAdapter } from "./llm-adapter.js"

export interface ChatMessage {
  role: "user" | "assistant"
  text: string
}

export interface ChatResult {
  answer: string
  mode: "llm" | "lookup"
  tool: string
  provider?: string
  model?: string
}

const GROUNDING_SYSTEM = `너는 공식 조회 원문에서 질문에 답하는 문장만 고르는 추출기다.
출력은 JSON 객체 하나뿐이다: {"evidence":["조회 원문과 글자 단위로 완전히 같은 문장"]}
규칙: evidence 각 값은 반드시 [조회된 자료]의 연속된 정확한 부분문자열이어야 한다. 바꾸어 쓰기, 요약, 추론, 설명, 마크다운을 금지한다. 관련 근거가 없으면 {"evidence":[]}를 출력한다.`

function installationRoutes(message: string): RoutedQuery[] | null {
  if (!/(아파트|공동주택)/.test(message) || !/스프링클러/.test(message) || !/(설치|기준|대상)/.test(message)) return null
  return [
    { tool: "get_fire_law_annex", args: { lawName: "소방시설 설치 및 관리에 관한 법률 시행령", annex: "4", query: "공동주택" } },
    { tool: "get_fire_admin_rule_text", args: { ruleName: "NFPC 103" } },
    { tool: "get_fire_admin_rule_text", args: { ruleName: "NFTC 103" } },
  ]
}

function priorContextMissing(message: string, history: ChatMessage[]): boolean {
  return history.length === 0 && /^(그중|그 중|위에서|방금|그거|그것|몇 번째|\d+번)/.test(message.trim())
}

async function retrieve(routes: RoutedQuery[], clients: Clients): Promise<{ text: string; tools: string; error?: string }> {
  const parts: string[] = []
  const used: string[] = []
  for (const route of routes) {
    const tool = allTools.find((candidate) => candidate.name === route.tool)
    if (!tool) return { text: "", tools: "none", error: `질문을 처리할 도구를 찾지 못했습니다: ${route.tool}` }
    try {
      const result = await tool.handler(clients, route.args)
      const text = result.content.map((content) => content.text).join("\n")
      if (!result.isError && !/\n결과 없음/.test(text)) {
        parts.push(`[${route.tool}]\n${truncate(text, 12_000)}`)
        used.push(route.tool)
      } else if (routes.length === 1) return { text, tools: route.tool, error: text }
    } catch (err) {
      const detail = maskSensitiveUrl(err instanceof Error ? err.message : String(err))
      console.error(`공식 자료 조회 실패 (${route.tool}):`, detail)
      if (routes.length === 1) return { text: "", tools: route.tool, error: `조회 중 오류가 발생했습니다: ${detail}` }
    }
  }
  if (parts.length === 0) return { text: "", tools: routes.map((r) => r.tool).join(", "), error: "관련 공식 자료를 찾지 못했습니다." }
  return { text: truncate(parts.join("\n\n"), 24_000), tools: used.join(", ") }
}

function verifiedEvidence(raw: string, retrieved: string): string[] {
  const parsed = extractFirstJsonObject(raw) as { evidence?: unknown } | null
  if (!parsed || !Array.isArray(parsed.evidence)) return []
  return [...new Set(parsed.evidence)]
    .filter((value): value is string => typeof value === "string" && value.trim().length >= 4)
    .filter((value) => retrieved.includes(value))
    .slice(0, 12)
}

export async function handleChat(
  message: string,
  clients: Clients,
  adapter: LlmAdapter | null,
  history: ChatMessage[] = []
): Promise<ChatResult> {
  const validation = questionValidationError(message)
  if (validation) return { answer: `${validation}. 실제 달력 날짜로 다시 입력하세요.`, mode: "lookup", tool: "validation" }
  if (priorContextMissing(message, history)) {
    return { answer: "이전 대화 내용이 전달되지 않아 대상을 알 수 없습니다. 무엇의 몇 번인지 함께 적어주세요.", mode: "lookup", tool: "context" }
  }
  const primary = (adapter ? await llmRoute(message, adapter, history) : null) ?? routeQuestion(message)
  const routes = installationRoutes(message) ?? [primary]
  const found = await retrieve(routes, clients)
  if (found.error) return { answer: found.error, mode: "lookup", tool: found.tools }
  if (!adapter) return { answer: found.text, mode: "lookup", tool: found.tools }

  try {
    const context = history.length ? `\n[직전 대화]\n${history.slice(-8).map((m) => `${m.role}: ${m.text}`).join("\n")}` : ""
    const raw = await adapter.generate(GROUNDING_SYSTEM, `질문: ${message}${context}\n\n[조회된 자료]\n${found.text}`)
    const evidence = verifiedEvidence(raw, found.text)
    if (evidence.length === 0) throw new Error("LLM이 원문과 일치하는 근거를 반환하지 않았습니다.")
    return {
      answer: `[AI가 선별한 공식 근거]\n${evidence.map((item) => `- ${item}`).join("\n")}\n\n[공식 조회 원문]\n${found.text}`,
      mode: "llm", tool: found.tools, provider: adapter.name, model: adapter.model ?? "unknown",
    }
  } catch (err) {
    const detail = maskSensitiveUrl(err instanceof Error ? err.message : String(err))
    console.error("LLM 근거 추출 실패, 공식 원문 반환:", detail)
    return { answer: `(AI 답변 생성에 실패해 조회 결과 원문을 표시합니다)\n\n${found.text}`, mode: "lookup", tool: found.tools }
  }
}
