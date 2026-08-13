import { z } from "zod"
import type { FireApiClient } from "../lib/fire-api-client.js"
import { statsTtlFor } from "../lib/cache.js"
import { formatBody } from "../lib/format.js"
import { textResult, type ToolResult } from "../lib/errors.js"
import { isValidCompactDate } from "../lib/korean-date.js"

export const SearchFireStatsSchema = z.object({
  date: z
    .string()
    .regex(/^\d{8}$/, "YYYYMMDD 8자리")
    .refine(isValidCompactDate, "유효한 YYYYMMDD 날짜")
    .describe("발생일자 (YYYYMMDD, 예: 20250315)"),
  pageNo: z.number().int().min(1).default(1).describe("페이지 번호"),
  numOfRows: z.number().int().min(1).max(1000).default(100).describe("결과 수 (최대 1000)"),
})

export type SearchFireStatsInput = z.infer<typeof SearchFireStatsSchema>

export { statsTtlFor as statsTtl }

export async function searchFireStats(client: FireApiClient, args: SearchFireStatsInput): Promise<ToolResult> {
  const body = await client.call(
    "FireInformationService",
    "getOcByfrstFireSmrzPcnd",
    { ocrn_ymd: args.date, pageNo: args.pageNo, numOfRows: args.numOfRows },
    statsTtlFor(args.date)
  )
  return textResult(formatBody(body, `화재발생현황 — ${args.date}`))
}
