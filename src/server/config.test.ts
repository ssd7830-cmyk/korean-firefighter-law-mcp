import { describe, expect, it } from "vitest"
import { httpPort } from "./config.js"

describe("httpPort", () => {
  it("미지정이면 8080", () => expect(httpPort(undefined)).toBe(8080))
  it("유효한 포트를 정수로 바꾼다", () => expect(httpPort("3000")).toBe(3000))
  it.each(["abc", "0", "-1", "65536", "1.5"])("잘못된 PORT %s를 시작 전에 거부한다", (value) => {
    expect(() => httpPort(value)).toThrow("1~65535")
  })
})
