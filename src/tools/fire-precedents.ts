import { z } from "zod"
import type { LawApiClient } from "../lib/law-api-client.js"
import { toArray } from "../lib/xml.js"
import { textResult, type ToolResult } from "../lib/errors.js"

export const SearchFirePrecedentsSchema = z.object({
  query: z.string().min(1).describe("검색어 (예: 소방시설 점검, 위험물 저장, 소방공무원 순직)"),
  display: z.number().int().min(1).max(100).default(20).describe("결과 수"),
})

export type SearchFirePrecedentsInput = z.infer<typeof SearchFirePrecedentsSchema>

export async function searchFirePrecedents(
  client: LawApiClient,
  args: SearchFirePrecedentsInput
): Promise<ToolResult> {
  const parsed = await client.search("prec", args.query, { display: String(args.display) })
  const precs = toArray<any>(parsed?.PrecSearch?.prec)
  if (precs.length === 0) {
    return textResult(`"${args.query}" 판례 검색 결과 없음. 키워드를 바꿔서 시도하세요 (예: "소방시설" → "소방시설 설치").`)
  }
  const lines = precs.map(
    (p, i) =>
      `${i + 1}. ${p.사건명} | ${p.법원명 ?? "-"} ${p.사건번호 ?? ""} | 선고 ${p.선고일자 ?? "-"} [판례ID:${p.판례일련번호}]`
  )
  return textResult(`판례 검색 — "${args.query}" (${precs.length}건)\n${lines.join("\n")}`)
}
