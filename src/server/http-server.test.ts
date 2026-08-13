import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import type { AddressInfo } from "node:net"
import { createServer } from "node:http"
import { startHttpServer } from "./http-server.js"
import { createClients } from "./factory.js"

// startHttpServer는 listen까지 하므로 포트 0(랜덤)을 쓰기 위해 PORT를 가로채는 대신
// 직접 포트를 넘긴다. 테스트 후 프로세스가 잡히지 않게 서버 핸들을 확보해야 하는데
// startHttpServer가 핸들을 반환하지 않으므로 여기서는 포트 고정 + 프로세스 종료에 맡긴다.
const TEST_PORT = 18923
const URL_BASE = `http://127.0.0.1:${TEST_PORT}`

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
}

function rpc(id: number, method: string, params: unknown) {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params })
}

async function postMcp(body: string, extraHeaders: Record<string, string> = {}): Promise<any> {
  const res = await fetch(`${URL_BASE}/mcp`, {
    method: "POST",
    headers: { ...MCP_HEADERS, ...extraHeaders },
    body,
  })
  const text = await res.text()
  // enableJsonResponse여도 SSE(data: ...)로 올 수 있어 둘 다 처리
  const dataLine = text.split("\n").find((l) => l.startsWith("data: "))
  return JSON.parse(dataLine ? dataLine.slice(6) : text)
}

beforeAll(() => {
  startHttpServer(createClients(), TEST_PORT)
})

describe("HTTP 모드 — stateless MCP 서버", () => {
  it("health 체크가 뜬다", async () => {
    const res = await fetch(`${URL_BASE}/health`)
    expect(res.status).toBe(200)
    expect(await res.text()).toBe("ok")
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

  it("tools/list가 도구 9개를 반환한다 (사전 initialize 없는 독립 요청)", async () => {
    const json = await postMcp(rpc(2, "tools/list", {}))
    expect(json.result.tools.length).toBe(9)
  })

  it("GET은 405 (stateless — SSE 스트림 미지원)", async () => {
    const res = await fetch(`${URL_BASE}/mcp`)
    expect(res.status).toBe(405)
  })

  it("깨진 JSON은 400", async () => {
    const res = await fetch(`${URL_BASE}/mcp`, { method: "POST", headers: MCP_HEADERS, body: "{깨짐" })
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
  const AUTH_PORT = 18924

  beforeAll(() => {
    process.env.SERVER_AUTH_TOKEN = "secret-token"
    startHttpServer(createClients(), AUTH_PORT)
  })

  afterAll(() => {
    delete process.env.SERVER_AUTH_TOKEN
  })

  it("토큰 없으면 401, 맞는 토큰이면 통과", async () => {
    const noAuth = await fetch(`http://127.0.0.1:${AUTH_PORT}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: rpc(1, "tools/list", {}),
    })
    expect(noAuth.status).toBe(401)

    const withAuth = await fetch(`http://127.0.0.1:${AUTH_PORT}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: "Bearer secret-token" },
      body: rpc(2, "tools/list", {}),
    })
    expect(withAuth.status).toBe(200)
  })
})

describe("챗봇 라우트", () => {
  it("GET / 는 채팅 화면 HTML을 준다", async () => {
    const res = await fetch(`${URL_BASE}/`)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain("소방 AI 도우미")
    expect(html).toContain("/api/chat")
  })

  it("POST /api/chat 에 message 없으면 400", async () => {
    const res = await fetch(`${URL_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})
