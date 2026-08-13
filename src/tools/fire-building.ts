import { z } from "zod"
import type { FireApiClient } from "../lib/fire-api-client.js"
import { TTL } from "../lib/cache.js"
import { formatBody, filterBodyByKeyword } from "../lib/format.js"
import { textResult, type ToolResult } from "../lib/errors.js"

/**
 * 오퍼레이션명은 활용가이드 문서(2026-08-13 다운로드)로 확정, 실호출 검증 완료.
 * 기관 계정 등에서 다르면 env FIRE_BUILDING_OP / FIRE_FACILITY_OP로 교체 가능.
 */
const BUILDING_SERVICE = "SpecificFireObjectInfoService"
const BUILDING_OP = process.env.FIRE_BUILDING_OP || "getAccomList"
const FACILITY_SERVICE = "SpecificFireObjectFirefightingSysInfoService"
const FACILITY_OP = process.env.FIRE_FACILITY_OP || "getAccomFirefightingSysList"

export const SearchFireBuildingSchema = z.object({
  sido: z.string().min(1).describe("시도명 (예: 서울특별시, 경기도)"),
  approvalYear: z
    .string()
    .regex(/^\d{4}$/, "YYYY 4자리")
    .optional()
    .describe("사용승인 연도 (YYYY, 선택)"),
  pageNo: z.number().int().min(1).default(1).describe("페이지 번호"),
  numOfRows: z.number().int().min(1).max(1000).default(50).describe("결과 수 (최대 1000)"),
})

export type SearchFireBuildingInput = z.infer<typeof SearchFireBuildingSchema>

export async function searchFireBuilding(client: FireApiClient, args: SearchFireBuildingInput): Promise<ToolResult> {
  const body = await client.call(
    BUILDING_SERVICE,
    BUILDING_OP,
    { ctpvNm: args.sido, useAprvYr: args.approvalYear, pageNo: args.pageNo, numOfRows: args.numOfRows },
    TTL.ARTICLE
  )
  return textResult(formatBody(body, `특정소방대상물 — ${args.sido}${args.approvalYear ? " " + args.approvalYear + "년 승인" : ""}`))
}

export const GetBuildingFacilitiesSchema = z.object({
  sido: z.string().min(1).describe("시도명 (예: 서울특별시)"),
  buildingName: z.string().optional().describe("대상물명 (선택, 결과 내 필터)"),
  pageNo: z.number().int().min(1).default(1).describe("페이지 번호"),
  numOfRows: z.number().int().min(1).max(1000).default(50).describe("결과 수 (최대 1000)"),
})

export type GetBuildingFacilitiesInput = z.infer<typeof GetBuildingFacilitiesSchema>

export async function getBuildingFacilities(
  client: FireApiClient,
  args: GetBuildingFacilitiesInput
): Promise<ToolResult> {
  let body = await client.call(
    FACILITY_SERVICE,
    FACILITY_OP,
    { ctpvNm: args.sido, pageNo: args.pageNo, numOfRows: args.numOfRows },
    TTL.ARTICLE
  )
  if (args.buildingName) body = filterBodyByKeyword(body, args.buildingName)
  return textResult(formatBody(body, `소방시설 현황 — ${args.sido}${args.buildingName ? " / " + args.buildingName : ""}`))
}
