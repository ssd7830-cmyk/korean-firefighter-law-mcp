/** 질문을 LLM 계획 → 공식 API 조회로 근거화한 뒤, LLM이 조회 자료 안에서만 인용을 달아 답한다. */
import { allTools, type Clients } from "../tool-registry.js"
import { maskSensitiveUrl } from "../lib/fetch-with-retry.js"
import { truncate } from "../lib/format.js"
import { isValidCompactDate } from "../lib/korean-date.js"
import { llmPlan, type RoutedQuery } from "./llm-router.js"
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

const ANSWER_SYSTEM = `너는 소방 실무자를 돕는 답변자다. [조회된 자료]에 있는 내용만으로 질문에 한국어로 답한다.
규칙:
- 자료에 없는 사실·수치·조문을 만들지 않는다. 자료에 없으면 "조회된 자료에서 확인되지 않는다"고 말한다.
- 주장·수치·기준을 담은 문장 끝에 근거 자료 번호를 [자료 N] 형식으로 붙인다.
- 자료끼리 내용이 충돌하면 충돌 사실을 밝힌다.
- 출력은 답변 본문만 쓴다. 머리말, JSON, 마크다운 헤더를 쓰지 않는다.`

function priorContextMissing(message: string, history: ChatMessage[]): boolean {
  return history.length === 0 && /^(그중|그 중|위에서|방금|그거|그것|몇 번째|\d+번)/.test(message.trim())
}

/** 날짜처럼 쓴 값이 달력상 무효면 조회로 넘기지 않고 명확히 거부한다. */
function questionValidationError(q: string): string | undefined {
  const compact = q.match(/\b\d{8}\b/)?.[0]
  if (compact && !isValidCompactDate(compact)) return `유효하지 않은 날짜입니다: ${compact}`
  const m = q.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/)
  if (!m) return undefined
  const value = `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`
  return isValidCompactDate(value) ? undefined : `유효하지 않은 날짜입니다: ${m[0]}`
}

interface Retrieved {
  text: string // "[자료 N] 도구명\n원문" 블록 합본
  used: string[] // 성공한 도구명 (자료 번호 순)
  failed: string[] // 실패·0건 도구명
  error?: string // 전부 실패 시 사용자 안내
}

async function retrieve(routes: RoutedQuery[], clients: Clients): Promise<Retrieved> {
  const results = await Promise.all(
    routes.map(async (route) => {
      const tool = allTools.find((candidate) => candidate.name === route.tool)
      if (!tool) return { route, text: null, detail: "미등록 도구" }
      try {
        const result = await tool.handler(clients, route.args)
        const text = result.content.map((content) => content.text).join("\n")
        if (result.isError || /\n결과 없음/.test(text)) return { route, text: null, detail: text }
        return { route, text, detail: "" }
      } catch (err) {
        const detail = maskSensitiveUrl(err instanceof Error ? err.message : String(err))
        console.error(`공식 자료 조회 실패 (${route.tool}):`, detail)
        return { route, text: null, detail: `조회 오류: ${detail}` }
      }
    })
  )
  const oks = results.filter((r) => r.text !== null)
  const fails = results.filter((r) => r.text === null)
  if (oks.length === 0) {
    const detail = fails.map((f) => `- ${f.route.tool}: ${truncate(f.detail, 600)}`).join("\n")
    return {
      text: "",
      used: [],
      failed: fails.map((f) => f.route.tool),
      error: `공식 자료 조회에 실패했습니다.\n${detail}`,
    }
  }
  // 합본을 끝에서 자르면 뒤쪽 자료 번호와 본문이 통째로 사라진다. 성공 자료 모두에 예산을 나눠 병기한다.
  const perSourceLimit = Math.min(12_000, Math.floor(23_500 / oks.length))
  const text = oks
    .map((r, i) => `[자료 ${i + 1}] ${r.route.tool}\n${truncate(r.text as string, perSourceLimit)}`)
    .join("\n\n")
  return { text, used: oks.map((r) => r.route.tool), failed: fails.map((f) => f.route.tool) }
}

/** 답변의 각 문장이 실존하는 자료 번호를 1개 이상 인용해야 통과한다. */
function citedAnswer(raw: string, sourceCount: number): string | null {
  const answer = raw.trim()
  if (!answer) return null
  const sentences = answer
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?。！？]+(?:[.!?。！？]+(?=\s|$)|$)/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  if (sentences.length === 0) return null
  for (const sentence of sentences) {
    const cited = [...sentence.matchAll(/\[자료 (\d+)\]/g)].map((m) => Number(m[1]))
    if (cited.length === 0 || cited.some((n) => n < 1 || n > sourceCount)) return null
  }
  return answer
}

export async function handleChat(
  message: string,
  clients: Clients,
  adapter: LlmAdapter,
  history: ChatMessage[] = []
): Promise<ChatResult> {
  const validation = questionValidationError(message)
  if (validation) return { answer: `${validation}. 실제 달력 날짜로 다시 입력하세요.`, mode: "lookup", tool: "validation" }
  if (priorContextMissing(message, history)) {
    return { answer: "이전 대화 내용이 전달되지 않아 대상을 알 수 없습니다. 무엇의 몇 번인지 함께 적어주세요.", mode: "lookup", tool: "context" }
  }
  const plan = await llmPlan(message, adapter, history)
  if (!plan) {
    // 계획 실패 시 추측 조회를 하지 않는다 — 틀린 자료보다 명확한 실패가 낫다
    return {
      answer: "질문을 조회 도구로 변환하지 못했습니다. 법령명·조 번호·날짜·지역 등을 구체적으로 적어 다시 질문해주세요.",
      mode: "lookup", tool: "routing",
    }
  }
  const found = await retrieve(plan, clients)
  if (found.error) return { answer: found.error, mode: "lookup", tool: found.failed.join(", ") }
  const failNote = found.failed.length ? `\n\n(일부 조회 실패: ${found.failed.join(", ")})` : ""

  try {
    const context = history.length ? `\n[직전 대화]\n${history.slice(-8).map((m) => `${m.role}: ${m.text}`).join("\n")}` : ""
    const raw = await adapter.generate(ANSWER_SYSTEM, `질문: ${message}${context}\n\n[조회된 자료]\n${found.text}`)
    const answer = citedAnswer(raw, found.used.length)
    if (!answer) throw new Error("LLM 답변에 유효한 [자료 N] 인용이 없습니다.")
    return {
      answer: `${answer}${failNote}\n\n[공식 조회 자료]\n${found.text}`,
      mode: "llm", tool: found.used.join(", "), provider: adapter.name, model: adapter.model ?? "unknown",
    }
  } catch (err) {
    const detail = maskSensitiveUrl(err instanceof Error ? err.message : String(err))
    console.error("LLM 답변 생성 실패, 공식 원문 반환:", detail)
    return { answer: `(AI 답변 생성에 실패해 조회 결과 원문을 표시합니다)\n\n${found.text}${failNote}`, mode: "lookup", tool: found.used.join(", ") }
  }
}
