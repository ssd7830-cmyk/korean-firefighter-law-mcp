import { z } from "zod"
import type { FireApiClient } from "../lib/fire-api-client.js"
import { TTL } from "../lib/cache.js"
import { toArray } from "../lib/xml.js"
import { formatBody } from "../lib/format.js"
import { emptyResult, textResult, type ToolResult } from "../lib/errors.js"

const SVC = "materialInfoSvc"

export const SearchHazmatSchema = z.object({
  query: z.string().min(1).max(100).describe('물질명·CAS번호·UN번호 (예: "아세톤", "67-64-1", "1090")'),
  display: z.number().int().min(1).max(50).default(10).describe("결과 수"),
})

export type SearchHazmatInput = z.infer<typeof SearchHazmatSchema>

/**
 * 국가 위험물 정보 — 목록은 서버 필터가 없어 전체(약 7,300건)를 1회 호출로 받아
 * 캐시(24h)한 뒤 이름·CAS·UN으로 매칭한다. 정확히 한 물질로 좁혀지면 상세 물성까지 조회.
 */
export async function searchHazmat(client: FireApiClient, args: SearchHazmatInput): Promise<ToolResult> {
  const body = await client.call(SVC, "getMaterialList", { pageNo: 1, numOfRows: 8000 }, TTL.ARTICLE)
  const all = toArray<Record<string, string>>(body.items?.item as any)
  const q = args.query.trim()
  const matches = all.filter((m) => (m.chemicalname ?? "").includes(q) || m.casno === q || m.unno === q)
  if (matches.length === 0) {
    return emptyResult(`"${q}" 위험물 검색 결과 없음. 물질명(예: 아세톤)이나 CAS 번호로 다시 시도하세요.`)
  }

  const exact = matches.find((m) => m.chemicalname === q) ?? (matches.length === 1 ? matches[0] : undefined)
  if (exact?.casno) {
    const detail = await client.call(SVC, "getMaterialInfo", { casNo: exact.casno, pageNo: 1, numOfRows: 1 }, TTL.ARTICLE)
    return textResult(formatBody(detail, `위험물 상세 — ${exact.chemicalname} (CAS ${exact.casno})`))
  }

  const lines = matches
    .slice(0, args.display)
    .map(
      (m, i) =>
        `${i + 1}. ${m.chemicalname} | 품명: ${m.hazardmaterialclass || "-"} | CAS: ${m.casno || "-"}${m.unno ? ` | UN: ${m.unno}` : ""}`
    )
  const more = matches.length > args.display ? `\n… 외 ${matches.length - args.display}건` : ""
  return textResult(
    `위험물 검색 — "${q}" (${matches.length}건)\n${lines.join("\n")}${more}\n💡 정확한 물질명이나 CAS 번호로 검색하면 상세 물성이 나옵니다`
  )
}
