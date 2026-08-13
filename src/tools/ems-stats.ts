import { z } from "zod"
import type { FireApiClient } from "../lib/fire-api-client.js"
import { statsTtlFor } from "../lib/cache.js"
import { formatBody } from "../lib/format.js"
import { textResult, type ToolResult } from "../lib/errors.js"

export const GetEmsStatsSchema = z.object({
  sido: z.string().min(1).describe("시도본부명 (예: 서울소방재난본부, 경기소방재난본부)"),
  fireStation: z.string().optional().describe("출동소방서명 (선택)"),
  month: z
    .string()
    .regex(/^\d{6}$/, "YYYYMM 6자리")
    .optional()
    .describe("접수년월 (YYYYMM, 선택)"),
  patientType: z.string().optional().describe("환자유형 (선택)"),
  pageNo: z.number().int().min(1).default(1).describe("페이지 번호"),
  numOfRows: z.number().int().min(1).max(1000).default(100).describe("결과 수 (최대 1000)"),
})

export type GetEmsStatsInput = z.infer<typeof GetEmsStatsSchema>

export async function getEmsStats(client: FireApiClient, args: GetEmsStatsInput): Promise<ToolResult> {
  const body = await client.call(
    "EmergencyStatisticsService",
    "getTrafficAccidentEmgActStats",
    {
      sidoHqOgidNm: args.sido,
      rsacGutFsttOgidNm: args.fireStation,
      rcptYm: args.month,
      rlifOccrTyCdNm: args.patientType,
      pageNo: args.pageNo,
      numOfRows: args.numOfRows,
    },
    statsTtlFor(args.month)
  )
  return textResult(formatBody(body, `구급활동 통계(교통사고) — ${args.sido}${args.month ? " " + args.month : ""}`))
}
