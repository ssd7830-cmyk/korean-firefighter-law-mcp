import { describe, it, expect } from "vitest"
import { zodToJsonSchema } from "zod-to-json-schema"
import { allTools } from "./tool-registry.js"

describe("tool-registry — 등록 무결성", () => {
  it("도구는 7개, 이름 중복 없음", () => {
    expect(allTools.length).toBe(7)
    expect(new Set(allTools.map((t) => t.name)).size).toBe(7)
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
})
