/**
 * Streamable HTTP stateless 서버 (MCP 표준)
 * - 요청마다 fresh Server + Transport → 재시작·스케일아웃 무손실
 * - 인증키: 요청 헤더(X-Data-Go-Kr-Key, X-Law-Oc) 우선, 없으면 서버 env
 * - SERVER_AUTH_TOKEN 설정 시 MCP·챗봇 API Bearer 토큰 검사
 * - TLS·사용자별 인증은 앞단 기관 게이트웨이가 담당 (DEPLOY.md 참조)
 * - 챗봇 API에는 기본 보안 헤더와 IP별 호출 한도가 있다
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server as HttpServer } from "node:http"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { requestContext } from "../lib/request-context.js"
import { createMcpServer } from "./factory.js"
import { handleChat } from "./chat-pipeline.js"
import { createLlmAdapter } from "./llm-adapter.js"
import { CHAT_PAGE_HTML } from "../web/chat-page.js"
import { maskSensitiveUrl } from "../lib/fetch-with-retry.js"
import { clientIp, FixedWindowRateLimiter } from "./rate-limit.js"
import { authorized, setSecurityHeaders } from "./http-security.js"
import type { Clients } from "../tool-registry.js"
import { httpHost, requireAuthForPublicHost } from "./config.js"
import { headerValue, parseHistory, PayloadTooLargeError, readBody } from "./http-body.js"

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function startHttpServer(clients: Clients, port: number, adapter = createLlmAdapter()): HttpServer {
  const mcpAuthToken = process.env.SERVER_AUTH_TOKEN
  const chatAuthToken = process.env.CHAT_AUTH_TOKEN || mcpAuthToken
  const host = httpHost(process.env.HOST)
  requireAuthForPublicHost(host, mcpAuthToken, chatAuthToken)
  const chatLimit = positiveInt(process.env.CHAT_RATE_LIMIT_PER_MINUTE, 60)
  const trustProxy = process.env.TRUST_PROXY === "true"
  const chatRateLimiter = new FixedWindowRateLimiter(chatLimit)

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      setSecurityHeaders(res)
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok")
        return
      }
      if (req.url === "/status") {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify({
          status: "ok", mode: adapter ? "llm" : "chat-disabled", provider: adapter?.name ?? null, model: adapter?.model ?? null,
        }))
        return
      }
      // 챗봇 화면 (소방관용) — 브라우저에서 바로 채팅
      if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(CHAT_PAGE_HTML)
        return
      }
      // 챗봇 API — 무조건 조회 → (LLM 있으면) 자료 기반 답변
      if (req.url === "/api/chat") {
        if (req.method !== "POST") {
          res.writeHead(405, { Allow: "POST" }).end()
          return
        }
        if (chatAuthToken && !authorized(req.headers.authorization, chatAuthToken)) {
          res.writeHead(401, { "Content-Type": "text/plain" }).end("unauthorized")
          return
        }
        // 챗봇 라우팅은 LLM 전용 — 어댑터가 없으면 추측 조회 대신 명확히 거부 (/mcp는 영향 없음)
        if (!adapter) {
          res.writeHead(503, { "Content-Type": "text/plain; charset=utf-8" })
            .end("LLM이 설정되지 않아 챗봇을 사용할 수 없습니다. DEPLOY.md 'LLM 연결'을 참조하세요.")
          return
        }
        if (!chatRateLimiter.allow(clientIp(req, trustProxy))) {
          res.writeHead(429, { "Content-Type": "text/plain", "Retry-After": "60" }).end("rate limit exceeded")
          return
        }
        let message: unknown
        let history = parseHistory(undefined)
        try {
          const body = JSON.parse(await readBody(req, 64 * 1024)) as { message?: unknown; history?: unknown }
          message = body.message
          history = parseHistory(body.history)
        } catch (err) {
          if (err instanceof PayloadTooLargeError) {
            res.writeHead(413, { "Content-Type": "text/plain" }).end("payload too large")
            return
          }
          res.writeHead(400, { "Content-Type": "text/plain" }).end("invalid json")
          return
        }
        if (typeof message !== "string" || !message.trim() || message.length > 2000) {
          res.writeHead(400, { "Content-Type": "text/plain" }).end("message required (1~2000자)")
          return
        }
        const keys = {
          dataGoKrKey: headerValue(req, "x-data-go-kr-key"),
          lawOc: headerValue(req, "x-law-oc"),
        }
        const result = await requestContext.run(keys, () => handleChat(message, clients, adapter, history))
        res
          .writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify(result))
        return
      }
      if (!req.url?.startsWith("/mcp")) {
        res.writeHead(404).end()
        return
      }
      if (req.method !== "POST") {
        // stateless 모드: GET(SSE 스트림)·DELETE(세션 종료)는 지원하지 않음 — MCP 공식 stateless 예제와 동일
        res.writeHead(405, { Allow: "POST" }).end()
        return
      }
      if (mcpAuthToken && !authorized(req.headers.authorization, mcpAuthToken)) {
        res.writeHead(401, { "Content-Type": "text/plain" }).end("unauthorized")
        return
      }

      let body: unknown
      try {
        body = JSON.parse(await readBody(req, 4 * 1024 * 1024))
      } catch (err) {
        if (err instanceof PayloadTooLargeError) {
          res.writeHead(413, { "Content-Type": "text/plain" }).end("payload too large")
          return
        }
        res.writeHead(400, { "Content-Type": "text/plain" }).end("invalid json")
        return
      }

      const keys = {
        dataGoKrKey: headerValue(req, "x-data-go-kr-key"),
        lawOc: headerValue(req, "x-law-oc"),
      }

      await requestContext.run(keys, async () => {
        const server = createMcpServer(clients)
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless
          enableJsonResponse: true, // SSE 대신 일반 JSON 응답 (커넥터 호환 단순화)
        })
        res.on("close", () => {
          transport.close()
          server.close()
        })
        await server.connect(transport)
        await transport.handleRequest(req, res, body)
      })
    } catch (err) {
      const detail = err instanceof Error ? err.stack || err.message : String(err)
      console.error("HTTP 요청 처리 오류:", maskSensitiveUrl(detail))
      if (!res.headersSent) res.writeHead(500).end()
    }
  })

  httpServer.listen(port, host, () => {
    const address = httpServer.address()
    const actualPort = typeof address === "object" && address ? address.port : port
    const llmNote = adapter ? `AI 답변 모드 (${adapter.name})` : "비활성 — LLM 설정 필요 (DEPLOY.md 'LLM 연결' 참조), MCP는 정상 동작"
    console.error(
      `korean-firefighter-law-mcp HTTP 모드 시작 (${host}:${actualPort})\n` +
        `  챗봇:     GET  /        — ${llmNote}\n` +
        `  챗봇 API: POST /api/chat\n` +
        `  MCP:      POST /mcp`
    )
  })
  return httpServer
}
