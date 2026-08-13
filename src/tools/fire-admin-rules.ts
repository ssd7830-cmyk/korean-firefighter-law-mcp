import { z } from "zod"
import type { LawApiClient } from "../lib/law-api-client.js"
import { toArray } from "../lib/xml.js"
import { textResult, type ToolResult } from "../lib/errors.js"

export const SearchFireAdminRulesSchema = z.object({
  query: z.string().min(1).max(200).describe('검색어 — 시설명이면 충분 (예: "스프링클러", "옥내소화전", "방화문")'),
  display: z.number().int().min(1).max(100).default(20).describe("결과 수"),
})

export type SearchFireAdminRulesInput = z.infer<typeof SearchFireAdminRulesSchema>

/** 행정규칙(고시·훈령) 검색 — 화재안전성능기준(NFPC)·기술기준(NFTC)이 여기 속한다 */
export async function searchFireAdminRules(
  client: LawApiClient,
  args: SearchFireAdminRulesInput
): Promise<ToolResult> {
  let parsed = await client.search("admrul", args.query, { display: String(args.display) })
  let rules = toArray<any>(parsed?.AdmRulSearch?.admrul)
  let byText = false
  if (rules.length === 0) {
    // 규칙 "이름"에 없으면 본문 검색으로 폴백
    parsed = await client.search("admrul", args.query, { display: String(args.display), search: "2" })
    rules = toArray<any>(parsed?.AdmRulSearch?.admrul)
    byText = true
  }
  if (rules.length === 0) {
    return textResult(
      `"${args.query}" 행정규칙 검색 결과 없음. 시설명으로 다시 시도하세요 (예: "스프링클러", "자동화재탐지설비").`
    )
  }
  const lines = rules.map(
    (r, i) =>
      `${i + 1}. ${r.행정규칙명} [${r.행정규칙종류 ?? "-"}] 소관:${r.소관부처명 ?? "-"} 발령:${r.발령일자 ?? "-"}`
  )
  const head = byText
    ? `행정규칙 검색 — "${args.query}" 이름 일치 없음 → 본문 검색 (${rules.length}건)`
    : `행정규칙 검색 — "${args.query}" (${rules.length}건)`
  return textResult(`${head}\n${lines.join("\n")}`)
}
