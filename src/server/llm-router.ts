/**
 * LLM 질문 계획기 — 자연어 질문을 공식 API 호출 계획(도구+인자 1~4개)으로 변환 (유일한 라우터)
 * 도구 스키마(tool-registry)와 법령 사전(search-normalizer)을 프롬프트로 구조화해 전달한다.
 * 각 호출은 도구 Zod 스키마로 개별 검증하며, 유효한 호출이 하나도 없으면 null →
 * chat-pipeline이 추측 조회 없이 안내 오류를 반환한다.
 * LLM은 계획만 세운다 — 답변 자료는 여전히 API 조회에서만 나온다.
 */

import { zodToJsonSchema } from "zod-to-json-schema"
import { allTools } from "../tool-registry.js"
import { FIRE_LAWS, FIRE_LAW_ALIASES } from "../lib/search-normalizer.js"
import { koreanDate } from "../lib/korean-date.js"
import type { LlmAdapter } from "./llm-adapter.js"
import { extractFirstJsonObject } from "../lib/json-extract.js"
import { maskSensitiveUrl } from "../lib/fetch-with-retry.js"

export interface RoutedQuery {
  tool: string
  args: Record<string, unknown>
}

export const MAX_PLAN_CALLS = 4

// 구급통계 API가 실제로 받는 시도본부 기관명 (기준.md 실데이터 검증 근거)
const EMS_HQ_NAMES = [
  "서울소방재난본부", "부산소방재난본부", "대구소방안전본부", "인천소방본부",
  "대전소방본부", "울산소방본부", "세종소방본부", "경기소방재난본부",
  "경기북부소방재난본부", "강원소방본부", "충북소방본부", "충남소방본부",
  "전북소방본부", "경북소방본부", "경남소방본부", "제주소방안전본부", "창원소방본부",
]

function planningPrompt(today: string): string {
  const catalog = allTools
    .map((t) => `- ${t.name}: ${t.description}\n  args 스키마: ${JSON.stringify(zodToJsonSchema(t.schema))}`)
    .join("\n")
  return `너는 소방 도메인 질문 계획기다. 질문에 답하는 데 필요한 공식 API 호출을 아래 도구로 계획한다.
출력은 JSON 객체 하나뿐: {"calls":[{"tool":"도구명","args":{...}}]} — 1~${MAX_PLAN_CALLS}개, 설명·마크다운 금지.

[도구 목록]
${catalog}

[도메인 지식]
- 오늘: ${today}. date 인자는 YYYYMMDD, month는 YYYYMM (어제·지난달 같은 상대 표현은 오늘 기준으로 계산)
- 소방 관계 법령 정식 명칭: ${FIRE_LAWS.join(" / ")}
- 통용 약칭: ${FIRE_LAW_ALIASES.join(", ")} — "소방시설"처럼 일부만 말해도 가장 가까운 법령의 정식 명칭이나 약칭을 lawName에 넣는다
- 조번호 jo는 "제10조"/"제10조의2" 형식으로 정규화 ("제10", "10조" 같은 변형 포함)
- 구급통계 sido는 다음 실제 기관명 중 하나를 그대로 쓴다: ${EMS_HQ_NAMES.join(", ")}
- 광주·전남은 2026년 7월 이후 "전남광주통합특별시소방본부". 그 전 자료는 각각 "광주소방안전본부", "전남소방본부"
- 근거가 여러 문서에 나뉘는 질문은 필요한 도구를 모두 계획한다. 예: 설비 설치 기준·대상 질문은
  시행령 별표(get_fire_law_annex)와 화재안전기준 NFPC·NFTC(get_fire_admin_rule_text)를 함께 조회해야
  완전한 근거가 된다 (성능기준 NFPC와 기술기준 NFTC는 별개 문서다).
- 방화문·방화구획·내화구조·피난계단·배연창 등 건축물 구조·피난 기준의 본체는 국토교통부 건축
  법령이다 ("건축물의 피난·방화구조 등의 기준에 관한 규칙" 등) → search_fire_law로 조회한다.
  NFPC·NFTC 행정규칙은 소방시설(소화·경보·피난구조설비 등) 설치 기준이다. 애매하면 둘 다 계획한다.
- 기준·수치·설치대상 같은 내용 질문은 검색(목록)만으로 답할 수 없다 — 원문 도구를 반드시 함께
  계획한다. 조·절 번호를 모르면 get_fire_law_text의 query, get_fire_admin_rule_text의 section,
  get_fire_law_annex의 query에 핵심 키워드를 넣어 관련 부분만 추출한다.
- 통계와 법령이 섞인 질문도 각각의 도구를 모두 계획한다.
- 어느 도구인지 확신이 없으면 {"calls":[{"tool":"search_fire_law","args":{"query":"핵심 키워드"}}]}`
}

/** 응답에서 호출 목록을 관대하게 회수한다 — {"calls":[...]} 우선, 구형 {"tool":...} 단일 객체도 수용 */
function rawCalls(json: Record<string, unknown>): unknown[] {
  if (Array.isArray(json.calls)) return json.calls
  if (typeof json.tool === "string") return [json]
  return []
}

export async function llmPlan(
  message: string,
  adapter: LlmAdapter,
  history: ReadonlyArray<{ role: string; text: string }> = []
): Promise<RoutedQuery[] | null> {
  try {
    const today = koreanDate().iso
    const context = history.length
      ? `[직전 대화]\n${history.slice(-8).map((m) => `${m.role}: ${m.text}`).join("\n")}\n\n`
      : ""
    const raw = await adapter.generate(planningPrompt(today), `${context}질문: ${message}`)
    const json = extractFirstJsonObject(raw) as Record<string, unknown> | null
    if (!json) return null
    const valid: RoutedQuery[] = []
    for (const call of rawCalls(json)) {
      const candidate = call as { tool?: unknown; args?: unknown } | null
      const tool = allTools.find((t) => t.name === candidate?.tool)
      if (!tool) continue
      const parsed = tool.schema.safeParse(candidate?.args ?? {})
      if (parsed.success) valid.push({ tool: tool.name, args: parsed.data as Record<string, unknown> })
    }
    return valid.length ? valid.slice(0, MAX_PLAN_CALLS) : null
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error("LLM 계획 실패:", maskSensitiveUrl(detail))
    return null
  }
}
