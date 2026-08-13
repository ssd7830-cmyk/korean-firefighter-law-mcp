import { z } from "zod"
import type { LawApiClient } from "../lib/law-api-client.js"
import { FIRE_LAWS, joLabel, resolveFireLawAlias, toJoCode } from "../lib/search-normalizer.js"
import { toArray } from "../lib/xml.js"
import { truncate } from "../lib/format.js"
import { textResult, type ToolResult } from "../lib/errors.js"

export const SearchFireLawSchema = z.object({
  query: z
    .string()
    .optional()
    .describe("법령명 또는 키워드 (약칭 지원: 화재예방법, 소방시설법 등). 비우면 소방 법령 목록 표시"),
  display: z.number().int().min(1).max(100).default(20).describe("결과 수"),
})

export type SearchFireLawInput = z.infer<typeof SearchFireLawSchema>

export async function searchFireLaw(client: LawApiClient, args: SearchFireLawInput): Promise<ToolResult> {
  if (!args.query || !args.query.trim()) {
    return textResult(
      `소방 관계 법령 목록 (search_fire_law에 이름을 넣어 검색, get_fire_law_text로 조문 조회):\n` +
        FIRE_LAWS.map((l, i) => `${i + 1}. ${l} (+ 시행령·시행규칙)`).join("\n")
    )
  }
  const query = resolveFireLawAlias(args.query)
  let parsed = await client.search("law", query, { display: String(args.display) })
  let laws = toArray<any>(parsed?.LawSearch?.law)
  let byText = false
  if (laws.length === 0) {
    // 법령 "이름"에 없으면 조문 본문 검색으로 폴백 ("방화문 설치 기준" 같은 내용 질문)
    parsed = await client.search("law", query, { display: String(args.display), search: "2" })
    laws = toArray<any>(parsed?.LawSearch?.law)
    byText = true
  }
  if (laws.length === 0) {
    return textResult(`"${query}" 검색 결과 없음. 정식 법령명이나 약칭(화재예방법, 소방시설법 등)으로 다시 시도하세요.`)
  }
  const lines = laws.map(
    (l, i) =>
      `${i + 1}. ${l.법령명한글} [MST:${l.법령일련번호}] 소관:${l.소관부처명 ?? "-"} 시행:${l.시행일자 ?? "-"}`
  )
  const head = byText
    ? `법령 검색 — "${query}" 이름 일치 없음 → 조문 내용 검색 (${laws.length}건)`
    : `법령 검색 — "${query}" (${laws.length}건)`
  return textResult(`${head}\n${lines.join("\n")}\n💡 조문 조회: get_fire_law_text(lawName 또는 mst)`)
}

export const GetFireLawTextSchema = z.object({
  lawName: z.string().optional().describe("법령명 (약칭 지원, mst 없을 때 검색해서 첫 매칭 사용)"),
  mst: z.string().optional().describe("법령일련번호 MST (search_fire_law 결과의 값, 있으면 우선)"),
  jo: z.string().optional().describe('조번호 (예: "제10조", "10", "10의2"). 비우면 전체 (길면 잘림)'),
})

export type GetFireLawTextInput = z.infer<typeof GetFireLawTextSchema>

/** 조문단위 트리에서 텍스트만 재귀 수집 (조문내용·항내용·호내용 등) */
export function collectText(node: unknown, out: string[]): void {
  if (node === null || node === undefined) return
  if (typeof node === "string") {
    if (node.trim()) out.push(node.trim())
    return
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out)
    return
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.endsWith("내용") || k === "항" || k === "호" || k === "목") collectText(v, out)
    }
  }
}

export async function getFireLawText(client: LawApiClient, args: GetFireLawTextInput): Promise<ToolResult> {
  let mst = args.mst
  let lawTitle = args.lawName ?? ""
  if (!mst) {
    if (!args.lawName) return textResult("lawName 또는 mst 중 하나는 필요합니다.")
    const query = resolveFireLawAlias(args.lawName)
    const found = toArray<any>((await client.search("law", query, { display: "30" }))?.LawSearch?.law)
    if (found.length === 0) return textResult(`"${query}" 법령을 찾지 못했습니다.`)
    const compact = query.replace(/\s+/g, "")
    const exact = found.find((l) => String(l.법령명한글).replace(/\s+/g, "") === compact)
    const pick = exact ?? found[0]
    mst = String(pick.법령일련번호)
    lawTitle = String(pick.법령명한글)
  }

  const params: Record<string, string> = { MST: mst }
  if (args.jo) params.JO = toJoCode(args.jo)
  const parsed = await client.service("law", params)
  const law = parsed?.법령
  if (!law) return textResult(`MST ${mst} 조회 결과가 비었습니다. MST 값을 확인하세요.`)

  const units = toArray<any>(law?.조문?.조문단위)
  const out: string[] = []
  for (const unit of units) collectText(unit, out)
  if (out.length === 0) return textResult(`${lawTitle} — 조문 내용을 찾지 못했습니다. jo 파라미터를 빼고 다시 시도하세요.`)

  const header = `${law?.기본정보?.법령명_한글 ?? lawTitle}${args.jo ? ` ${joLabel(args.jo)}` : ""}`
  return textResult(truncate(`${header}\n\n${out.join("\n")}`))
}
