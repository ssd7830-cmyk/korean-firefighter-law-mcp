import { z } from "zod"
import type { LawApiClient } from "../lib/law-api-client.js"
import { toArray } from "../lib/xml.js"
import { emptyResult, textResult, type ToolResult } from "../lib/errors.js"
import { truncate } from "../lib/format.js"

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
    return emptyResult(
      `"${args.query}" 행정규칙 검색 결과 없음. 시설명으로 다시 시도하세요 (예: "스프링클러", "자동화재탐지설비").`
    )
  }
  const lines = rules.map(
    (r, i) =>
      `${i + 1}. ${r.행정규칙명} [ID:${r.행정규칙일련번호 ?? "-"}] [${r.행정규칙종류 ?? "-"}] 소관:${r.소관부처명 ?? "-"} 발령:${r.발령일자 ?? "-"}`
  )
  const head = byText
    ? `행정규칙 검색 — "${args.query}" 이름 일치 없음 → 본문 검색 (${rules.length}건)`
    : `행정규칙 검색 — "${args.query}" (${rules.length}건)`
  return textResult(`${head}\n${lines.join("\n")}\n💡 원문 조회: get_fire_admin_rule_text(ruleName 또는 id)`)
}

export const GetFireAdminRuleTextSchema = z.object({
  ruleName: z.string().max(200).optional().describe("행정규칙명 또는 NFPC/NFTC 코드 (id가 없을 때 검색)"),
  id: z.string().max(30).optional().describe("행정규칙일련번호 (검색 결과의 ID)"),
  section: z.string().max(50).optional().describe('찾을 절 번호 또는 키워드 (예: "2.5.3", "공동주택")'),
})

export type GetFireAdminRuleTextInput = z.infer<typeof GetFireAdminRuleTextSchema>

function standardCode(value: string): string | undefined {
  const match = value.match(/\b(NFPC|NFTC)\s*(\d+[A-Z]?)\b/i)
  return match ? `${match[1].toUpperCase()}${match[2].toUpperCase()}` : undefined
}

function excerpt(value: string, needle: string): string {
  const at = value.indexOf(needle)
  if (at < 0 || value.length <= 1800) return value
  const start = Math.max(0, at - 800)
  const end = Math.min(value.length, at + needle.length + 800)
  return `${start ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`
}

function collectRuleText(node: unknown, out: string[]): void {
  if (node === null || node === undefined) return
  if (typeof node === "string") {
    if (node.trim()) out.push(node.trim())
    return
  }
  if (Array.isArray(node)) for (const child of node) collectRuleText(child, out)
  else if (typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) collectRuleText(value, out)
  }
}

export async function getFireAdminRuleText(
  client: LawApiClient,
  args: GetFireAdminRuleTextInput
): Promise<ToolResult> {
  let id = args.id
  let title = args.ruleName ?? ""
  if (!id) {
    if (!args.ruleName) return emptyResult("ruleName 또는 id 중 하나는 필요합니다.")
    const found = toArray<any>((await client.search("admrul", args.ruleName, { display: "100" }))?.AdmRulSearch?.admrul)
    if (found.length === 0) return emptyResult(`"${args.ruleName}" 행정규칙을 찾지 못했습니다.`)
    const compact = args.ruleName.replace(/\s+/g, "").toLowerCase()
    const code = standardCode(args.ruleName)
    const pick = found.find((r) => String(r.행정규칙명).replace(/\s+/g, "").toLowerCase() === compact)
      ?? (code ? found.find((r) => standardCode(String(r.행정규칙명)) === code) : undefined)
      ?? found.find((r) => String(r.행정규칙명).replace(/\s+/g, "").toLowerCase().includes(compact))
      ?? found[0]
    id = String(pick.행정규칙일련번호)
    title = String(pick.행정규칙명)
  }
  const parsed = await client.service("admrul", { ID: id })
  const root = parsed?.AdmRulService
  if (!root) return emptyResult(`행정규칙 ID ${id} 조회 결과가 비었습니다.`)
  title = String(root?.행정규칙기본정보?.행정규칙명 ?? title)
  const lines: string[] = []
  collectRuleText(root?.조문내용, lines)
  collectRuleText(root?.부칙, lines)
  collectRuleText(root?.제개정이유, lines)
  const unique = [...new Set(lines)]
  const selected = args.section
    ? unique.filter((line, index) => line.includes(args.section!) || unique.slice(Math.max(0, index - 1), index + 2).some((v) => v.includes(args.section!)))
    : unique
  if (selected.length === 0) return emptyResult(`${title} — "${args.section}" 부분을 원문에서 찾지 못했습니다.`)
  const display = args.section ? selected.map((line) => excerpt(line, args.section!)) : selected
  return textResult(truncate(`${title} [행정규칙 ID:${id}]${args.section ? ` — ${args.section}` : ""}\n\n${display.join("\n")}`))
}
