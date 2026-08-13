import { describe, expect, it } from "vitest"
import { httpHost, httpPort, requireAuthForPublicHost } from "./config.js"

describe("httpPort", () => {
  it("미지정이면 8080", () => expect(httpPort(undefined)).toBe(8080))
  it("유효한 포트를 정수로 바꾼다", () => expect(httpPort("3000")).toBe(3000))
  it.each(["abc", "0", "-1", "65536", "1.5"])("잘못된 PORT %s를 시작 전에 거부한다", (value) => {
    expect(() => httpPort(value)).toThrow("1~65535")
  })
})

describe("HTTP 공개 범위", () => {
  it("기본은 로컬호스트에만 바인딩한다", () => expect(httpHost(undefined)).toBe("127.0.0.1"))
  it("외부 바인딩은 인증 토큰 없이는 거부한다", () => {
    expect(() => requireAuthForPublicHost("0.0.0.0", undefined, undefined)).toThrow("SERVER_AUTH_TOKEN")
    expect(() => requireAuthForPublicHost("0.0.0.0", "server", undefined)).not.toThrow()
  })
})
