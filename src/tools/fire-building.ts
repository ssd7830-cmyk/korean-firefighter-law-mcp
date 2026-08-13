import { z } from "zod"
import type { FireApiClient } from "../lib/fire-api-client.js"
import { TTL } from "../lib/cache.js"
import { formatBody, filterBodyByKeyword } from "../lib/format.js"
import { textResult, type ToolResult } from "../lib/errors.js"
import { toArray } from "../lib/xml.js"
import type { DataGoKrBody } from "../lib/fire-api-client.js"

/**
 * 오퍼레이션명은 활용가이드 문서(2026-08-13 다운로드)로 확정, 실호출 검증 완료.
 * 기관 계정 등에서 다르면 env FIRE_BUILDING_OP / FIRE_FACILITY_OP로 교체 가능.
 */
const BUILDING_SERVICE = "SpecificFireObjectInfoService"
const BUILDING_OP = process.env.FIRE_BUILDING_OP || "getAccomList"
const FACILITY_SERVICE = "SpecificFireObjectFirefightingSysInfoService"
const FACILITY_OP = process.env.FIRE_FACILITY_OP || "getAccomFirefightingSysList"

export const SearchFireBuildingSchema = z.object({
  sido: z.string().min(1).max(100).describe("시도명 (예: 서울특별시, 경기도)"),
  buildingName: z.string().max(200).optional().describe("대상물명 (선택, 전체 페이지 결과 내 필터)"),
  approvalYear: z
    .string()
    .regex(/^\d{4}$/, "YYYY 4자리")
    .optional()
    .describe("사용승인 연도 (YYYY, 선택)"),
  pageNo: z.number().int().min(1).default(1).describe("페이지 번호"),
  numOfRows: z.number().int().min(1).max(1000).default(50).describe("결과 수 (최대 1000)"),
})

export type SearchFireBuildingInput = z.infer<typeof SearchFireBuildingSchema>

async function fetchAllForKeyword(
  client: FireApiClient,
  service: string,
  operation: string,
  params: Record<string, string | number | undefined>,
  keyword: string
): Promise<DataGoKrBody> {
  const numOfRows = 1000
  const items: Record<string, unknown>[] = []
  let previousSignature = ""
  // totalCount가 페이지 건수로 오는 서비스라서 짧은 페이지가 나올 때까지 읽는다.
  for (let pageNo = 1; pageNo <= 100; pageNo++) {
    const page = await client.call(service, operation, { ...params, pageNo, numOfRows }, TTL.ARTICLE)
    const pageItems = toArray<Record<string, unknown>>(page.items?.item as any)
    const signature = JSON.stringify(pageItems.slice(0, 2))
    if (pageNo > 1 && pageItems.length > 0 && signature === previousSignature) break
    items.push(...pageItems)
    if (pageItems.length < numOfRows) break
    previousSignature = signature
  }
  return filterBodyByKeyword({ items: { item: items }, totalCount: items.length }, keyword)
}

export async function searchFireBuilding(client: FireApiClient, args: SearchFireBuildingInput): Promise<ToolResult> {
  const params = { ctpvNm: args.sido, useAprvYr: args.approvalYear }
  const body = args.buildingName
    ? await fetchAllForKeyword(client, BUILDING_SERVICE, BUILDING_OP, params, args.buildingName)
    : await client.call(
        BUILDING_SERVICE,
        BUILDING_OP,
        { ...params, pageNo: args.pageNo, numOfRows: args.numOfRows },
        TTL.ARTICLE
      )
  const suffix = `${args.approvalYear ? " " + args.approvalYear + "년 승인" : ""}${args.buildingName ? " / " + args.buildingName : ""}`
  return textResult(formatBody(body, `특정소방대상물 — ${args.sido}${suffix}`))
}

export const GetBuildingFacilitiesSchema = z.object({
  sido: z.string().min(1).max(100).describe("시도명 (예: 서울특별시)"),
  buildingName: z.string().max(200).optional().describe("대상물명 (선택, 전체 페이지 결과 내 필터)"),
  pageNo: z.number().int().min(1).default(1).describe("페이지 번호"),
  numOfRows: z.number().int().min(1).max(1000).default(50).describe("결과 수 (최대 1000)"),
})

export type GetBuildingFacilitiesInput = z.infer<typeof GetBuildingFacilitiesSchema>

export async function getBuildingFacilities(
  client: FireApiClient,
  args: GetBuildingFacilitiesInput
): Promise<ToolResult> {
  const body = args.buildingName
    ? await fetchAllForKeyword(client, FACILITY_SERVICE, FACILITY_OP, { ctpvNm: args.sido }, args.buildingName)
    : await client.call(
        FACILITY_SERVICE,
        FACILITY_OP,
        { ctpvNm: args.sido, pageNo: args.pageNo, numOfRows: args.numOfRows },
        TTL.ARTICLE
      )
  return textResult(formatBody(body, `소방시설 현황 — ${args.sido}${args.buildingName ? " / " + args.buildingName : ""}`))
}
