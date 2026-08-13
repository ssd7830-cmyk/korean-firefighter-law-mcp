/**
 * LLM 질문 라우터 — 자연어 질문을 도구+인자 JSON으로 변환 (규칙 라우터의 앞단)
 * 도구 스키마(tool-registry)와 법령 사전(search-normalizer)을 프롬프트로 구조화해 전달한다.
 * 실패(응답에 JSON 없음·미등록 도구·인자 스키마 불일치·LLM 오류) 시 null → 규칙 라우터 폴백.
 * LLM은 도구 선택만 한다 — 답변 자료는 여전히 API 조회에서만 나온다.
 */

import { zodToJsonSchema } from "zod-to-json-schema"
import { allTools } from "../tool-registry.js"
import { FIRE_LAWS, FIRE_LAW_ALIASES } from "../lib/search-normalizer.js"
import { koreanDate } from "../lib/korean-date.js"
import type { LlmAdapter } from "./llm-adapter.js"
import type { RoutedQuery } from "./query-router.js"
import { extractFirstJsonObject } from "../lib/json-extract.js"
import { maskSensitiveUrl } from "../lib/fetch-with-retry.js"

function routingPrompt(today: string): string {
  const catalog = allTools
    .map((t) => `- ${t.name}: ${t.description}\n  args 스키마: ${JSON.stringify(zodToJsonSchema(t.schema))}`)
    .join("\n")
  return `너는 소방 도메인 질문 라우터다. 사용자 질문을 아래 도구 하나와 인자로 변환한다.
출력은 JSON 객체 하나뿐: {"tool":"도구명","args":{...}} — 설명·마크다운 금지.

[도구 목록]
${catalog}

[도메인 지식]
- 오늘: ${today}. date 인자는 YYYYMMDD, month는 YYYYMM (어제·지난달 같은 상대 표현은 오늘 기준으로 계산)
- 소방 관계 법령 정식 명칭: ${FIRE_LAWS.join(" / ")}
- 통용 약칭: ${FIRE_LAW_ALIASES.join(", ")} — "소방시설"처럼 일부만 말해도 가장 가까운 법령의 정식 명칭이나 약칭을 lawName에 넣는다
- 조번호 jo는 "제10조"/"제10조의2" 형식으로 정규화 ("제10", "10조" 같은 변형 포함)
- 구급통계 sido는 기관별 실제 시도본부명. 예: "서울소방재난본부", "인천소방본부", "대구소방안전본부", "제주소방안전본부"
- 광주·전남은 2026년 7월 이후 "전남광주통합특별시소방본부". 그 전 자료는 각각 "광주소방안전본부", "전남소방본부"
- 어느 도구인지 확신이 없으면 {"tool":"search_fire_law","args":{"query":"핵심 키워드"}}`
}

export async function llmRoute(
  message: string,
  adapter: LlmAdapter,
  history: ReadonlyArray<{ role: string; text: string }> = []
): Promise<RoutedQuery | null> {
  try {
    const today = koreanDate().iso
    const context = history.length
      ? `[직전 대화]\n${history.slice(-8).map((m) => `${m.role}: ${m.text}`).join("\n")}\n\n`
      : ""
    const raw = await adapter.generate(routingPrompt(today), `${context}질문: ${message}`)
    const json = extractFirstJsonObject(raw) as { tool?: unknown; args?: unknown } | null
    if (!json) return null
    const tool = allTools.find((t) => t.name === json.tool)
    if (!tool) return null
    const parsed = tool.schema.safeParse(json.args ?? {})
    if (!parsed.success) return null
    return { tool: tool.name, args: parsed.data as Record<string, unknown> }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error("LLM 라우팅 실패, 규칙 라우터 사용:", maskSensitiveUrl(detail))
    return null
  }
}
