#!/usr/bin/env node
/**
 * korean-firefighter-law-mcp — 소방청 공공데이터 + 소방 법령 MCP 서버
 * 실행 모드: stdio(기본) | http (--mode http, 포트는 PORT env)
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createClients, createMcpServer } from "./server/factory.js"
import { startHttpServer } from "./server/http-server.js"
import { VERSION } from "./version.js"

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const modeIdx = args.indexOf("--mode")
  const mode = modeIdx >= 0 ? args[modeIdx + 1] : "stdio"
  const clients = createClients()

  if (mode === "http") {
    startHttpServer(clients, Number(process.env.PORT) || 8080)
    return
  }

  const server = createMcpServer(clients)
  await server.connect(new StdioServerTransport())
  // stdout은 MCP 프로토콜 전용 — 로그는 stderr로만
  console.error(`korean-firefighter-law-mcp v${VERSION} 시작 (stdio)`)
}

main().catch((err) => {
  console.error("서버 시작 실패:", err)
  process.exit(1)
})
