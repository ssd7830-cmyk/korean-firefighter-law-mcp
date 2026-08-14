import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import type { AddressInfo } from "node:net"
import { request as httpRequest, type Server as HttpServer } from "node:http"
import { once } from "node:events"
import { startHttpServer } from "./http-server.js"
import { createClients } from "./factory.js"
import { requestContext } from "../lib/request-context.js"
import type { Clients } from "../tool-registry.js"
import type { LlmAdapter } from "./llm-adapter.js"

// 챗봇은 LLM 필수 — HTTP 테스트는 결정적 계획·답변을 주는 가짜 어댑터를 주입한다
const fakeAdapter: LlmAdapter = {
  name: "fake",
  model: "fake-model",
  generate: async (system) =>
    system.includes("계획기")
      ? '{"calls":[{"tool":"search_fire_law","args":{"query":"소방기본법"}}]}'
      : "조회 결과를 확인했습니다 [자료 1]",
}

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
}

async function serverUrl(server: HttpServer): Promise<string> {
  if (!server.listening) await once(server, "listening")
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

function rpc(id: number, method: string, params: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params })
}

async function postMcp(body: string, extraHeaders: Record<string, string> = {}): Promise<any> {
  const res = await fetch(`${urlBase}/mcp`, {
    method: "POST",
    headers: { ...MCP_HEADERS, ...extraHeaders },
    body,
  })
  const text = await res.text()
  // enableJsonResponse여도 SSE(data: ...)로 올 수 있어 둘 다 처리
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "))
  return JSON.parse(dataLine ? dataLine.slice(6) : text)
}

async function postWithSplitUtf8(url: string, body: string, headers: Record<string, string>): Promise<number> {
  const bytes = Buffer.from(body)
  const splitAt = bytes.indexOf(Buffer.from("소")) + 1 // 3바이트 한글 문자 내부에서 분할
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, {
      method: "POST",
      headers: { ...headers, "Content-Length": String(bytes.length) },
    }, (res) => {
      res.resume()
      res.on("end", () => resolve(res.statusCode ?? 0))
    })
    req.on("error", reject)
    req.write(bytes.subarray(0, splitAt))
    setTimeout(() => req.end(bytes.subarray(splitAt)), 10)
  })
}

let primaryServer: HttpServer
let urlBase: string

beforeAll(async () => {
  primaryServer = startHttpServer(createClients(), 0, fakeAdapter)
  urlBase = await serverUrl(primaryServer)
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => primaryServer.close((err) => (err ? reject(err) : resolve())))
})

describe("HTTP 모드 — stateless MCP 서버", () => {
  it("health 체크가 뜬다", async () => {
    const res = await fetch(`${urlBase}/health`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("ok")
  })

  it("브라우저·API 응답에 기본 보안 헤더를 건다", async () => {
    const res = await fetch(`${urlBase}/`)
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("x-frame-options")).toBe("DENY")
    expect(res.headers.get("referrer-policy")).toBe("no-referrer")
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'")
  })

  it("initialize 요청에 서버 정보로 응답한다", async () => {
    const json = await postMcp(
      rpc(1, "initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test", version: "0" },
      })
    )
    expect(json.result.serverInfo.name).toBe("korean-firefighter-law-mcp")
  })

  it("tools/list가 도구 11개를 반환한다 (사전 initialize 없는 독립 요청)", async () => {
    const json = await postMcp(rpc(2, "tools/list", {}))
    expect(json.result.tools.length).toBe(11)
  })

  it("GET은 405 (stateless — SSE 스트림 미지원)", async () => {
    const res = await fetch(`${urlBase}/mcp`)
    expect(res.status).toBe(405)
  })

  it("깨진 JSON은 400", async () => {
    const res = await fetch(`${urlBase}/mcp`, { method: "POST", headers: MCP_HEADERS, body: "{깨짐" })
    expect(res.status).toBe(400)
  })

  it("도구 호출이 끝까지 동작한다 (키 불필요 경로: 소방 법령 목록)", async () => {
    const json = await postMcp(
      rpc(3, "tools/call", { name: "search_fire_law", arguments: {} })
    )
    expect(json.result.content[0].text).toContain("소방기본법")
  })
})

describe("SERVER_AUTH_TOKEN — 접근 보호", () => {
  let authServer: HttpServer
  let authBase: string

  beforeAll(async () => {
    process.env.SERVER_AUTH_TOKEN = "secret-token"
    authServer = startHttpServer(createClients(), 0, fakeAdapter)
    authBase = await serverUrl(authServer)
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => authServer.close((err) => (err ? reject(err) : resolve())))
    delete process.env.SERVER_AUTH_TOKEN
  })

  it("토큰 없으면 401, 맞는 토큰이면 통과", async () => {
    const noAuth = await fetch(`${authBase}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: rpc(1, "tools/list", {}),
    })
    expect(noAuth.status).toBe(401)

    const withAuth = await fetch(`${authBase}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: "Bearer secret-token" },
      body: rpc(2, "tools/list", {}),
    })
    expect(withAuth.status).toBe(200)
  })

  it("SERVER_AUTH_TOKEN은 챗봇 API도 보호한다", async () => {
    const noAuth = await fetch(`${authBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "소방기본법" }),
    })
    expect(noAuth.status).toBe(401)

    const withAuth = await fetch(`${authBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer secret-token" },
      body: JSON.stringify({ message: "소방기본법" }),
    })
    expect(withAuth.status).toBe(200)
  })
})

describe("챗봇 라우트", () => {
  it("GET / 는 채팅 화면 HTML을 준다", async () => {
    const res = await fetch(`${urlBase}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("소방 AI 도우미")
    expect(html).toContain("/api/chat")
  })

  it("POST /api/chat 에 message 없으면 400", async () => {
    const res = await fetch(`${urlBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it("대화 문맥을 포함한 챗봇 요청 본문이 64KB를 넘으면 413", async () => {
    const res = await fetch(`${urlBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "질문", history: [{ role: "user", text: "가".repeat(70_000) }] }),
    })
    expect(res.status).toBe(413)
  })
})

describe("챗봇 호출량 보호", () => {
  let rateServer: HttpServer
  let rateBase: string

  beforeAll(async () => {
    process.env.CHAT_RATE_LIMIT_PER_MINUTE = "1"
    rateServer = startHttpServer(createClients(), 0, fakeAdapter)
    rateBase = await serverUrl(rateServer)
    delete process.env.CHAT_RATE_LIMIT_PER_MINUTE
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => rateServer.close((err) => (err ? reject(err) : resolve())))
  })

  it("한 IP가 분당 한도를 넘으면 429", async () => {
    const request = () =>
      fetch(`${rateBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "소방기본법" }),
      })
    expect((await request()).status).toBe(200)
    expect((await request()).status).toBe(429)
  })
})

describe("LLM 미설정 서버 — 챗봇 비활성, MCP는 정상", () => {
  let bareServer: HttpServer
  let bareBase: string

  beforeAll(async () => {
    bareServer = startHttpServer(createClients(), 0, null)
    bareBase = await serverUrl(bareServer)
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => bareServer.close((err) => (err ? reject(err) : resolve())))
  })

  it("/api/chat은 503과 LLM 설정 안내를 반환한다 (추측 조회 없음)", async () => {
    const res = await fetch(`${bareBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "소방기본법" }),
    })
    expect(res.status).toBe(503)
    expect(await res.text()).toContain("LLM")
  })

  it("/status가 chat-disabled를 보고한다", async () => {
    const json = await (await fetch(`${bareBase}/status`)).json()
    expect(json).toMatchObject({ status: "ok", mode: "chat-disabled", provider: null })
  })

  it("/mcp 도구는 LLM 없이 동작한다 (클라이언트 LLM이 라우팅)", async () => {
    const res = await fetch(`${bareBase}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: rpc(1, "tools/list", {}),
    })
    const text = await res.text()
    const dataLine = text.split("\n").find((l) => l.startsWith("data: "))
    const json = JSON.parse(dataLine ? dataLine.slice(6) : text)
    expect(json.result.tools.length).toBe(11)
  })
})

describe("챗봇 요청별 정부 API 키", () => {
  let headerServer: HttpServer
  let headerBase: string
  let observedLawOc: string | undefined
  let observedQuery: string | undefined

  beforeAll(async () => {
    const clients = {
      law: {
        search: async (_target: string, query: string) => {
          observedLawOc = requestContext.getStore()?.lawOc
          observedQuery = query
          return { law: { 법령명한글: "소방기본법", 법령일련번호: "1" } }
        },
      },
      fire: {},
    } as unknown as Clients
    headerServer = startHttpServer(clients, 0, fakeAdapter)
    headerBase = await serverUrl(headerServer)
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => headerServer.close((err) => (err ? reject(err) : resolve())))
  })

  it("X-Law-Oc를 /api/chat 처리 컨텍스트까지 전달한다", async () => {
    const res = await fetch(`${headerBase}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Law-Oc": "per-request-oc" },
      body: JSON.stringify({ message: "소방기본법 검색" }),
    })
    expect(res.status).toBe(200)
    expect(observedLawOc).toBe("per-request-oc")
  })

  it("TCP 청크가 한글 바이트 중간에서 갈려도 요청 문자열을 훼손하지 않는다", async () => {
    const status = await postWithSplitUtf8(
      `${headerBase}/api/chat`,
      JSON.stringify({ message: "소방기본법 검색" }),
      { "Content-Type": "application/json", "X-Law-Oc": "per-request-oc" }
    )
    expect(status).toBe(200)
    expect(observedQuery).toBe("소방기본법")
  })
})
