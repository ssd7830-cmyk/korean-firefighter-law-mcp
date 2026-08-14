import { z } from "zod"
import type { LawApiClient } from "../lib/law-api-client.js"
import { toArray } from "../lib/xml.js"
import { emptyResult, textResult, type ToolResult } from "../lib/errors.js"
import { truncate } from "../lib/format.js"
import { rankBodySearch } from "../lib/relevance.js"

export const SearchFireAdminRulesSchema = z.object({
  query: z.string().min(1).max(200).describe('검색어 — 시설명이면 충분 (예: "스프링클러", "옥내소화전", "자동화재탐지설비")'),
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
    // 규칙 "이름"에 없으면 본문 검색으로 폴백 — 가나다순뿐이라 전량 받아 소방 관련도순으로 재정렬
    parsed = await client.search("admrul", args.query, { display: "100", search: "2" })
    rules = rankBodySearch(
      toArray<any>(parsed?.AdmRulSearch?.admrul),
      args.query,
      (r) => ({ title: String(r.행정규칙명 ?? ""), dept: String(r.소관부처명 ?? "") }),
      ["소방청", "국립소방연구원"]
    ).slice(0, args.display)
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
  const total = Number(parsed?.AdmRulSearch?.totalCnt) || rules.length
  const head = byText
    ? `행정규칙 검색 — "${args.query}" 이름 일치 없음 → 본문 검색 (총 ${total}건 중 관련도순 ${rules.length}건)`
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
    const norm = (v: string) => v.replace(/\s+/g, "").toLowerCase()
    const compact = norm(args.ruleName)
    const code = standardCode(args.ruleName)
    // 토큰 전부 포함 후보 중 최단 이름 — "스프링클러 기준" 요청이 간이·조기진압용 등 파생(더 긴 이름)으로 새지 않게
    const toks = args.ruleName.split(/\s+/).filter(Boolean).map(norm)
    const tokenHits = found.filter((r) => toks.every((t) => norm(String(r.행정규칙명)).includes(t)))
    const pick = found.find((r) => norm(String(r.행정규칙명)) === compact)
      ?? (code ? found.find((r) => standardCode(String(r.행정규칙명)) === code) : undefined)
      ?? found.find((r) => norm(String(r.행정규칙명)).includes(compact))
      ?? (tokenHits.length ? tokenHits.reduce((a, b) => (norm(String(a.행정규칙명)).length <= norm(String(b.행정규칙명)).length ? a : b)) : undefined)
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
  const sec = args.section?.trim()
  // 절 번호(예: "2.7")는 줄 시작 매칭 — 부분 문자열로 하면 "2.7.3을 인용"한 다른 절이 잡힌다
  const numeric = sec && /^\d+(\.\d+)*$/.test(sec)
    ? unique.filter((line) => new RegExp(`^${sec.replace(/\./g, "\\.")}(?![0-9])`).test(line.trim()))
    : []
  // 키워드 절 검색은 토큰 AND — "헤드 수평거리"가 "헤드까지의 수평거리"와도 일치해야 한다
  const secToks = sec ? sec.split(/\s+/).filter(Boolean) : []
  const selected = !sec
    ? unique
    : numeric.length
      ? numeric
      : unique.filter((line) => secToks.every((t) => line.includes(t)))
  if (selected.length === 0) return emptyResult(`${title} — "${args.section}" 부분을 원문에서 찾지 못했습니다.`)
  const display = sec && !numeric.length ? selected.map((line) => excerpt(line, secToks[0])) : selected
  return textResult(truncate(`${title} [행정규칙 ID:${id}]${args.section ? ` — ${args.section}` : ""}\n\n${display.join("\n")}`))
}
