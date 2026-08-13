import { z } from "zod"
import type { LawApiClient } from "../lib/law-api-client.js"
import { toArray } from "../lib/xml.js"
import { emptyResult, textResult, type ToolResult } from "../lib/errors.js"

export const SearchFirePrecedentsSchema = z.object({
  query: z.string().min(1).max(200).describe("검색어 (예: 소방시설 점검, 위험물 저장, 소방공무원 순직)"),
  display: z.number().int().min(1).max(100).default(20).describe("결과 수"),
})

export type SearchFirePrecedentsInput = z.infer<typeof SearchFirePrecedentsSchema>

export async function searchFirePrecedents(
  client: LawApiClient,
  args: SearchFirePrecedentsInput
): Promise<ToolResult> {
  let query = args.query.trim()
  let parsed = await client.search("prec", query, { display: String(args.display) })
  let precs = toArray<any>(parsed?.PrecSearch?.prec)
  let fallback = false
  if (precs.length === 0 && query.includes(" ")) {
    query = query.split(/\s+/)[0]
    parsed = await client.search("prec", query, { display: String(args.display) })
    precs = toArray<any>(parsed?.PrecSearch?.prec)
    fallback = true
  }
  if (precs.length === 0) {
    return emptyResult(`"${args.query}" 판례 검색 결과 없음. 키워드를 바꿔서 더 짧은 핵심어로 다시 시도하세요.`)
  }
  const lines = precs.map(
    (p, i) =>
      `${i + 1}. ${p.사건명} | ${p.법원명 ?? "-"} ${p.사건번호 ?? ""} | 선고 ${p.선고일자 ?? "-"} [판례ID:${p.판례일련번호}]`
  )
  const note = fallback ? ` ("${args.query}" 0건 → "${query}"로 넓혀 검색)` : ""
  return textResult(`판례 검색 — "${query}"${note} (${precs.length}건)\n${lines.join("\n")}`)
}
