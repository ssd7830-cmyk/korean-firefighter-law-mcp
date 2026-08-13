#!/usr/bin/env node
/**
 * korean-firefighter-law-mcp — 소방청 공공데이터 + 소방 법령 MCP 서버 (stdio)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { InMemoryLruCache } from "./lib/cache.js"
import { FireApiClient } from "./lib/fire-api-client.js"
import { LawApiClient } from "./lib/law-api-client.js"
import { registerTools } from "./tool-registry.js"

async function main(): Promise<void> {
  const server = new Server(
    { name: "korean-firefighter-law-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  )

  const cache = new InMemoryLruCache(100)
  registerTools(server, {
    fire: new FireApiClient(cache),
    law: new LawApiClient(cache),
  })

  await server.connect(new StdioServerTransport())
  // stdout은 MCP 프로토콜 전용 — 로그는 stderr로만
  console.error("korean-firefighter-law-mcp v0.1.0 시작 (stdio)")
}

main().catch((err) => {
  console.error("서버 시작 실패:", err)
  process.exit(1)
})
