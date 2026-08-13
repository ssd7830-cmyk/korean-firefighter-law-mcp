import { describe, it, expect } from "vitest"
import { zodToJsonSchema } from "zod-to-json-schema"
import { allTools } from "./tool-registry.js"

describe("tool-registry — 등록 무결성", () => {
  it("도구는 11개, 이름 중복 없음", () => {
    expect(allTools.length).toBe(11)
    expect(new Set(allTools.map((t) => t.name)).size).toBe(11)
  })

  it("모든 도구에 설명이 있고 스키마가 JSON Schema(object)로 변환된다", () => {
    for (const tool of allTools) {
      expect(tool.description.length, tool.name).toBeGreaterThan(10)
      const schema = zodToJsonSchema(tool.schema) as { type?: string }
      expect(schema.type, tool.name).toBe("object")
    }
  })

  it("도구 이름은 MCP 관례(snake_case)를 따른다", () => {
    for (const tool of allTools) {
      expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/)
    }
  })

  it("모든 도구가 과도하게 긴 문자열 인자를 외부 API 호출 전에 거부한다", () => {
    const huge = "가".repeat(10_000)
    const args: Record<string, Record<string, string>> = {
      search_fire_stats: { date: huge },
      get_ems_stats: { sido: huge },
      search_fire_building: { sido: huge },
      get_building_facilities: { sido: huge },
      search_fire_law: { query: huge },
      get_fire_law_text: { lawName: huge },
      get_fire_law_annex: { lawName: huge },
      search_fire_precedents: { query: huge },
      search_fire_admin_rules: { query: huge },
      get_fire_admin_rule_text: { ruleName: huge },
      search_hazmat: { query: huge },
    }
    for (const tool of allTools) expect(tool.schema.safeParse(args[tool.name]).success, tool.name).toBe(false)
  })
})
