/**
 * Streamable HTTP stateless 서버 (MCP 표준)
 * - 요청마다 fresh Server + Transport → 재시작·스케일아웃 무손실
 * - 인증키: 요청 헤더(X-Data-Go-Kr-Key, X-Law-Oc) 우선, 없으면 서버 env
 * - SERVER_AUTH_TOKEN 설정 시 Bearer 토큰 검사 (공개 URL 남용 방지)
 * - HTTPS·rate limit은 배포 플랫폼 몫 (DEPLOY.md 참조)
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import { requestContext } from "../lib/request-context.js"
import { createMcpServer } from "./factory.js"
import { handleChat } from "./chat-pipeline.js"
import { createLlmAdapter } from "./llm-adapter.js"
import { CHAT_PAGE_HTML } from "../web/chat-page.js"
import type { Clients } from "../tool-registry.js"

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => {
      data += chunk
      if (data.length > 4 * 1024 * 1024) reject(new Error("body too large"))
    })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const v = req.headers[name]
  return Array.isArray(v) ? v[0] : v
}

export function startHttpServer(clients: Clients, port: number): void {
  const adapter = createLlmAdapter()
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "text/plain" }).end("ok")
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
        let message: unknown
        try {
          message = (JSON.parse(await readBody(req)) as { message?: unknown }).message
        } catch {
          res.writeHead(400, { "Content-Type": "text/plain" }).end("invalid json")
          return
        }
        if (typeof message !== "string" || !message.trim() || message.length > 2000) {
          res.writeHead(400, { "Content-Type": "text/plain" }).end("message required (1~2000자)")
          return
        }
        const result = await handleChat(message, clients, adapter)
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
      const expectedToken = process.env.SERVER_AUTH_TOKEN
      if (expectedToken && req.headers.authorization !== `Bearer ${expectedToken}`) {
        res.writeHead(401, { "Content-Type": "text/plain" }).end("unauthorized")
        return
      }

      let body: unknown
      try {
        body = JSON.parse(await readBody(req))
      } catch {
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
      console.error("HTTP 요청 처리 오류:", err)
      if (!res.headersSent) res.writeHead(500).end()
    }
  })

  httpServer.listen(port, () => {
    const llmNote = adapter ? `AI 답변 모드 (${adapter.name})` : "조회 모드 (LLM 키 없음 — DEPLOY.md 'LLM 연결' 참조)"
    console.error(
      `korean-firefighter-law-mcp HTTP 모드 시작 (포트 ${port})\n` +
        `  챗봇:     GET  /        — ${llmNote}\n` +
        `  챗봇 API: POST /api/chat\n` +
        `  MCP:      POST /mcp`
    )
  })
}
