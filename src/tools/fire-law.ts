import { z } from "zod"
import type { LawApiClient } from "../lib/law-api-client.js"
import { FIRE_LAWS, joLabel, resolveFireLawAlias, toJoCode } from "../lib/search-normalizer.js"
import { toArray } from "../lib/xml.js"
import { truncate } from "../lib/format.js"
import { emptyResult, textResult, type ToolResult } from "../lib/errors.js"
import { rankBodySearch } from "../lib/relevance.js"

export const SearchFireLawSchema = z.object({
  query: z
    .string()
    .max(200)
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
    // 가나다순뿐이라 전량 받아 소방·건축 소관 우선으로 재정렬
    parsed = await client.search("law", query, { display: "100", search: "2" })
    laws = rankBodySearch(
      toArray<any>(parsed?.LawSearch?.law),
      query,
      (l) => ({ title: String(l.법령명한글 ?? ""), dept: String(l.소관부처명 ?? "") }),
      ["소방청", "국토교통부"]
    ).slice(0, args.display)
    byText = true
  }
  if (laws.length === 0) {
    return emptyResult(`"${query}" 검색 결과 없음. 정식 법령명이나 약칭(화재예방법, 소방시설법 등)으로 다시 시도하세요.`)
  }
  const lines = laws.map(
    (l, i) =>
      `${i + 1}. ${l.법령명한글} [MST:${l.법령일련번호}] 소관:${l.소관부처명 ?? "-"} 시행:${l.시행일자 ?? "-"}`
  )
  const total = Number(parsed?.LawSearch?.totalCnt) || laws.length
  const head = byText
    ? `법령 검색 — "${query}" 이름 일치 없음 → 조문 내용 검색 (총 ${total}건 중 관련도순 ${laws.length}건)`
    : `법령 검색 — "${query}" (${laws.length}건)`
  return textResult(`${head}\n${lines.join("\n")}\n💡 조문 조회: get_fire_law_text(lawName 또는 mst)`)
}

export const GetFireLawTextSchema = z.object({
  lawName: z.string().max(200).optional().describe("법령명 (약칭 지원, mst 없을 때 검색해서 첫 매칭 사용)"),
  mst: z.string().max(30).optional().describe("법령일련번호 MST (search_fire_law 결과의 값, 있으면 우선)"),
  jo: z.string().max(30).optional().describe('조번호 (예: "제10조", "10", "10의2"). 비우면 전체 (길면 잘림)'),
  query: z.string().max(100).optional().describe('조문 내용에서 찾을 키워드 (예: "방화문") — 조번호를 모를 때 관련 조문만 추출'),
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
    if (!args.lawName) return emptyResult("lawName 또는 mst 중 하나는 필요합니다.")
    const query = resolveFireLawAlias(args.lawName)
    const found = toArray<any>((await client.search("law", query, { display: "30" }))?.LawSearch?.law)
    if (found.length === 0) return emptyResult(`"${query}" 법령을 찾지 못했습니다.`)
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
  if (!law) return emptyResult(`MST ${mst} 조회 결과가 비었습니다. MST 값을 확인하세요.`)

  const units = toArray<any>(law?.조문?.조문단위)
  const out: string[] = []
  for (const unit of units) {
    const lines: string[] = []
    collectText(unit, lines)
    // query가 있으면 키워드가 등장하는 조문 단위만 추출 (조번호를 모르는 내용 질문용)
    if (args.query && !lines.some((line) => line.includes(args.query!))) continue
    out.push(...lines)
  }
  if (out.length === 0) {
    return emptyResult(
      args.query
        ? `${lawTitle} — "${args.query}"가 포함된 조문이 없습니다. 다른 키워드로 다시 시도하세요.`
        : `${lawTitle} — 조문 내용을 찾지 못했습니다. jo 파라미터를 빼고 다시 시도하세요.`
    )
  }

  const header = `${law?.기본정보?.법령명_한글 ?? lawTitle}${args.jo ? ` ${joLabel(args.jo)}` : ""}${args.query ? ` — "${args.query}" 포함 조문` : ""}`
  return textResult(truncate(`${header}\n\n${out.join("\n")}`))
}

export const GetFireLawAnnexSchema = z.object({
  lawName: z.string().max(200).optional().describe("법령명 (약칭 지원, mst 없을 때 검색)"),
  mst: z.string().max(30).optional().describe("법령일련번호 MST"),
  annex: z.string().max(30).optional().describe('별표 번호 (예: "4", "별표 4")'),
  query: z.string().max(100).optional().describe('별표 안에서 찾을 키워드 (예: "공동주택")'),
})

export type GetFireLawAnnexInput = z.infer<typeof GetFireLawAnnexSchema>

export async function getFireLawAnnex(client: LawApiClient, args: GetFireLawAnnexInput): Promise<ToolResult> {
  let mst = args.mst
  let title = args.lawName ?? ""
  if (!mst) {
    if (!args.lawName) return emptyResult("lawName 또는 mst 중 하나는 필요합니다.")
    const query = resolveFireLawAlias(args.lawName)
    const found = toArray<any>((await client.search("law", query, { display: "30" }))?.LawSearch?.law)
    if (found.length === 0) return emptyResult(`"${query}" 법령을 찾지 못했습니다.`)
    const compact = query.replace(/\s+/g, "")
    const pick = found.find((l) => String(l.법령명한글).replace(/\s+/g, "") === compact) ?? found[0]
    mst = String(pick.법령일련번호)
    title = String(pick.법령명한글)
  }
  const law = (await client.service("law", { MST: mst }))?.법령
  const annexes = toArray<any>(law?.별표?.별표단위)
  const wanted = args.annex?.match(/\d+/)?.[0]
  const selected = wanted
    ? annexes.filter((a) => Number(a.별표번호) === Number(wanted))
    : annexes
  if (selected.length === 0) return emptyResult(`${title} — 별표 ${wanted ?? ""}를 찾지 못했습니다.`)
  const lines: string[] = []
  for (const annex of selected) collectText(annex, lines)
  // 키워드는 토큰 AND — "제1석유류 수용성"이 원문의 다른 어순·조사와도 일치해야 한다
  const toks = args.query?.split(/\s+/).filter(Boolean) ?? []
  const filtered = toks.length ? lines.filter((line) => toks.every((t) => line.includes(t))).map((line) => {
    const at = line.indexOf(toks[0])
    if (line.length <= 1800) return line
    const start = Math.max(0, at - 800)
    const end = Math.min(line.length, at + toks[0].length + 800)
    return `${start ? "…" : ""}${line.slice(start, end)}${end < line.length ? "…" : ""}`
  }) : lines
  if (filtered.length === 0) return emptyResult(`${title} 별표 ${wanted ?? ""} — "${args.query}"를 찾지 못했습니다.`)
  return textResult(truncate(`${law?.기본정보?.법령명_한글 ?? title} 별표 ${wanted ?? "전체"}${args.query ? ` — ${args.query}` : ""}\n\n${filtered.join("\n")}`))
}
