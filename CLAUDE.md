# korean-firefighter-law-mcp 작업 규칙

1. **요청 안 한 기능 만들지 않기. 같은 결과면 짧은 쪽. 다 만든 뒤 빼도 되는 코드 찾아서 빼기.**
2. 결과물은 MCP 서버 + 소방관용 챗봇 페이지 1장(v0.4, `src/web/chat-page.ts`)이다. 그 외 대시보드·프런트엔드는 만들지 않는다.
3. DB를 저장소에 넣지 않는다. 데이터는 API 실시간 호출 + 인메모리 캐시. SQLite는 호출 한도가 실측으로 문제 될 때만 `CacheStore` 구현체로 추가.
4. 모든 도구는 `src/tool-registry.ts`의 `allTools[]`에만 등록한다. 의존 방향: tools → lib → (fetch). 역방향 금지.
5. 파일당 200줄 미만, 단일 책임.
6. 인증키는 환경변수(`DATA_GO_KR_KEY`, `LAW_OC`)로만. 에러·로그에 키가 노출되지 않게 `maskSensitiveUrl`을 거친다.
7. stdout은 MCP 프로토콜 전용 — 로그는 반드시 stderr.
8. 확정된 의도·검증 기준은 `기준.md`에 기록하고, 증거 없이 "된다"고 표시하지 않는다 (미확인은 미확인으로).
