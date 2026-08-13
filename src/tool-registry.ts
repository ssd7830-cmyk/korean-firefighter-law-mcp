/**
 * MCP 도구 레지스트리 — 모든 도구는 여기 allTools[]에만 등록한다
 */

import type { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"
import type { FireApiClient } from "./lib/fire-api-client.js"
import type { LawApiClient } from "./lib/law-api-client.js"
import { formatToolError, type ToolResult } from "./lib/errors.js"

import { searchFireStats, SearchFireStatsSchema } from "./tools/fire-stats.js"
import { getEmsStats, GetEmsStatsSchema } from "./tools/ems-stats.js"
import {
  searchFireBuilding,
  SearchFireBuildingSchema,
  getBuildingFacilities,
  GetBuildingFacilitiesSchema,
} from "./tools/fire-building.js"
import {
  searchFireLaw, SearchFireLawSchema, getFireLawText, GetFireLawTextSchema,
  getFireLawAnnex, GetFireLawAnnexSchema,
} from "./tools/fire-law.js"
import { searchFirePrecedents, SearchFirePrecedentsSchema } from "./tools/fire-precedents.js"
import {
  searchFireAdminRules, SearchFireAdminRulesSchema,
  getFireAdminRuleText, GetFireAdminRuleTextSchema,
} from "./tools/fire-admin-rules.js"
import { searchHazmat, SearchHazmatSchema } from "./tools/hazmat.js"

export interface Clients {
  fire: FireApiClient
  law: LawApiClient
}

interface McpTool {
  name: string
  description: string
  schema: z.ZodTypeAny
  handler: (clients: Clients, args: any) => Promise<ToolResult>
}

export const allTools: McpTool[] = [
  {
    name: "search_fire_stats",
    description: "날짜별 화재발생현황 조회 (소방청 국가화재정보). 접수·진행·오인·자체진화 건수 등",
    schema: SearchFireStatsSchema,
    handler: (c, a) => searchFireStats(c.fire, SearchFireStatsSchema.parse(a)),
  },
  {
    name: "get_ems_stats",
    description: "시도본부·소방서별 구급활동 통계 조회 (교통사고 구급활동: 출동·이송 건수)",
    schema: GetEmsStatsSchema,
    handler: (c, a) => getEmsStats(c.fire, GetEmsStatsSchema.parse(a)),
  },
  {
    name: "search_fire_building",
    description: "특정소방대상물(건물) 검색 — 시도·건물명·사용승인연도별",
    schema: SearchFireBuildingSchema,
    handler: (c, a) => searchFireBuilding(c.fire, SearchFireBuildingSchema.parse(a)),
  },
  {
    name: "get_building_facilities",
    description: "특정소방대상물의 소방시설 현황 조회 (스프링클러 설치 여부 등)",
    schema: GetBuildingFacilitiesSchema,
    handler: (c, a) => getBuildingFacilities(c.fire, GetBuildingFacilitiesSchema.parse(a)),
  },
  {
    name: "search_fire_law",
    description: "소방 관계 법령 검색 (법제처). 약칭 지원: 화재예방법·소방시설법·위험물법 등. 검색어 없으면 소방 법령 목록",
    schema: SearchFireLawSchema,
    handler: (c, a) => searchFireLaw(c.law, SearchFireLawSchema.parse(a)),
  },
  {
    name: "get_fire_law_text",
    description: '소방 법령 조문 전문 조회 (예: lawName="소방시설법", jo="제10조")',
    schema: GetFireLawTextSchema,
    handler: (c, a) => getFireLawText(c.law, GetFireLawTextSchema.parse(a)),
  },
  {
    name: "get_fire_law_annex",
    description: "소방 법령 시행령 등의 별표 원문 조회. 별표 번호와 키워드로 적용 대상·시설 기준 확인",
    schema: GetFireLawAnnexSchema,
    handler: (c, a) => getFireLawAnnex(c.law, GetFireLawAnnexSchema.parse(a)),
  },
  {
    name: "search_fire_precedents",
    description: "소방 관련 판례 검색 (법제처). 소방시설·위험물·소방공무원 관련 재판례",
    schema: SearchFirePrecedentsSchema,
    handler: (c, a) => searchFirePrecedents(c.law, SearchFirePrecedentsSchema.parse(a)),
  },
  {
    name: "search_fire_admin_rules",
    description:
      "소방 행정규칙(고시·훈령) 검색 (법제처). 스프링클러·경보설비 등 소방시설 설치 기준의 본체인 화재안전성능기준(NFPC)·화재안전기술기준(NFTC)이 여기 있음",
    schema: SearchFireAdminRulesSchema,
    handler: (c, a) => searchFireAdminRules(c.law, SearchFireAdminRulesSchema.parse(a)),
  },
  {
    name: "get_fire_admin_rule_text",
    description: "화재안전성능기준(NFPC)·화재안전기술기준(NFTC) 행정규칙 원문 및 절 번호 조회",
    schema: GetFireAdminRuleTextSchema,
    handler: (c, a) => getFireAdminRuleText(c.law, GetFireAdminRuleTextSchema.parse(a)),
  },
  {
    name: "search_hazmat",
    description:
      "위험물안전관리법상 위험물 검색 (소방청 국가위험물정보). 물질명·CAS번호·UN번호로 품명(류별)·물성·사용용도 조회",
    schema: SearchHazmatSchema,
    handler: (c, a) => searchHazmat(c.fire, SearchHazmatSchema.parse(a)),
  },
]

export function registerTools(server: Server, clients: Clients): void {
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.schema) as Record<string, unknown>,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = allTools.find((t) => t.name === request.params.name)
    if (!tool) return formatToolError(request.params.name, new Error("등록되지 않은 도구"))
    try {
      return await tool.handler(clients, request.params.arguments ?? {})
    } catch (err) {
      return formatToolError(tool.name, err)
    }
  })
}
