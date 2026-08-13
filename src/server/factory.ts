/**
 * 서버·클라이언트 조립 — stdio와 HTTP 모드가 공유하는 팩토리
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { InMemoryLruCache } from "../lib/cache.js"
import { FireApiClient } from "../lib/fire-api-client.js"
import { LawApiClient } from "../lib/law-api-client.js"
import { registerTools, type Clients } from "../tool-registry.js"
import { VERSION } from "../version.js"

/** 프로세스당 1개 — 캐시는 요청·사용자 간 공유된다 (조회 결과에 개인정보 없음) */
export function createClients(): Clients {
  const cache = new InMemoryLruCache(100)
  return { fire: new FireApiClient(cache), law: new LawApiClient(cache) }
}

/** MCP Server 인스턴스 생성 + 도구 등록. HTTP stateless 모드에서는 요청마다 호출된다 */
export function createMcpServer(clients: Clients): Server {
  const server = new Server(
    { name: "korean-firefighter-law-mcp", version: VERSION },
    { capabilities: { tools: {} } }
  )
  registerTools(server, clients)
  return server
}
