import { describe, expect, it } from "vitest"
import { extractFirstJsonObject } from "./json-extract.js"

describe("extractFirstJsonObject", () => {
  it("중첩 객체·이스케이프·문자열 속 중괄호를 보존한다", () => {
    expect(extractFirstJsonObject('설명 {"a":{"b":"} \\\" {"}} 뒤'))
      .toEqual({ a: { b: '} " {' } })
  })
  it("유효한 객체가 없으면 null", () => expect(extractFirstJsonObject("{깨짐")).toBeNull())
})
