# 아키텍처

> 현행 v0.6.0 · 2026-08-13

소방청·법제처 API를 11개 읽기 전용 MCP 도구로 묶고, 같은 도구 위에 선택형 웹 채팅을 제공합니다.

## 두 배포 형태

```text
개별 PC 설치형                         기관 서버형
┌─────────────────┐                 ┌────────────────────┐
│ stdio MCP client │                 │ 브라우저 / API /    │
│ (로컬 AI 앱)     │                 │ 원격 MCP client     │
└────────┬────────┘                 └─────────┬──────────┘
         │ stdio                              │ HTTPS(앞단 프록시)
┌────────▼────────────────────────────────────▼──────────┐
│ korean-firefighter-law-mcp                           │
│ tool registry · query/LLM router · chat pipeline     │
└────────┬──────────────────────────────┬───────────────┘
         │ HTTPS                        │ HTTPS
┌────────▼────────────┐       ┌─────────▼──────────────┐
│ 소방청 data.go.kr   │       │ 법제처 law.go.kr       │
└─────────────────────┘       └────────────────────────┘
```

- stdio는 AI 클라이언트가 로컬 프로세스를 실행합니다. 웹 채팅과 서버 내 LLM 어댑터는 사용하지 않습니다.
- HTTP는 `GET /`, `POST /api/chat`, `POST /mcp`, `GET /health`, `GET /status`를 제공합니다.
- HTTP의 MCP는 요청마다 서버/transport를 만드는 stateless JSON 응답 방식입니다. GET SSE 세션은 제공하지 않습니다.
- ChatGPT는 로컬 stdio에 직접 연결하지 않습니다. 원격 제품 호환성은 배포 제품에서 별도 종단간 검증합니다.

## 처리 흐름

### MCP 도구 호출

1. MCP SDK가 도구명과 인자를 받습니다.
2. `tool-registry.ts`가 등록 도구를 찾고 Zod 스키마로 검증합니다.
3. 도구가 공공 API 클라이언트를 호출합니다.
4. 공통 포맷터가 한국어 텍스트 결과 또는 마스킹된 오류를 반환합니다.

### 웹 채팅/API

1. 토큰, IP별 호출 제한, 요청 크기를 검사합니다.
2. LLM 키가 있으면 LLM이 도구명·인자 JSON만 고릅니다. 실패하거나 잘못된 JSON이면 규칙 라우터로 전환합니다.
3. 선택된 도구로 공식 API를 먼저 조회합니다. 조회가 실패하면 답변 생성을 하지 않습니다.
4. LLM 키가 없으면 조회 원문을 반환합니다.
5. LLM 키가 있으면 관련 근거를 원문 그대로 고르게 하고, 서버가 정확한 부분문자열 일치를 검증한 뒤 원문과 함께 표시합니다.

자유 생성 요약은 표시하지 않으므로 원문에 없는 문장을 차단합니다. 다만 어떤 구절을 선택했는지와 원천 API
자체의 최신성·완전성은 별도 검토 대상입니다.

## 모듈

```text
src/
├── index.ts                    stdio/HTTP 진입점
├── version.ts
├── tool-registry.ts            11개 도구의 단일 등록 지점
├── lib/
│   ├── fire-api-client.ts      소방청 API 호출·응답 통일
│   ├── law-api-client.ts       법제처 검색·본문 호출
│   ├── fetch-with-retry.ts     제한시간·재시도·키 마스킹
│   ├── cache.ts                CacheStore + 인메모리 LRU
│   ├── request-context.ts      요청별 정부 API 키 격리
│   ├── korean-date.ts          Asia/Seoul 날짜
│   └── xml.ts / format.ts / search-normalizer.ts / errors.ts
├── tools/
│   ├── fire-stats.ts / ems-stats.ts / fire-building.ts / hazmat.ts
│   └── fire-law.ts / fire-precedents.ts / fire-admin-rules.ts
├── server/
│   ├── factory.ts              공유 API client와 MCP server 조립
│   ├── http-server.ts/http-body.ts HTTP 라우트·인증·본문 한도
│   ├── http-security.ts        Bearer 비교·보안 응답 헤더
│   ├── rate-limit.ts           bounded fixed-window 호출 제한
│   ├── chat-pipeline.ts        조회 우선 답변 흐름
│   ├── query-router.ts         규칙 라우터
│   ├── llm-router.ts           스키마 검증 LLM 라우터
│   └── llm-adapter.ts/cli-llm-adapter.ts API 및 제한된 로컬 CLI 어댑터
└── web/chat-page.ts            단일 페이지 채팅 UI
```

테스트는 구현 옆 `*.test.ts`에 둡니다. 저장소 버전·문서·런타임·필수 파일 일관성도
`repository-readiness.test.ts`로 검사합니다.

## 도구와 실제 범위

| 분류 | 도구 | 입력·범위 핵심 |
|---|---|---|
| 화재 | `search_fire_stats` | 날짜. 소방관서별 접수·진행·오인 등 |
| 구급 | `get_ems_stats` | 시도·연월. **교통사고 구급활동만** |
| 대상물 | `search_fire_building` | 시도 필수, 건물명·사용승인연도 선택 |
| 시설 | `get_building_facilities` | 시도 필수, 건물명·소방시설 선택 |
| 법령 | `search_fire_law` | 법령명 또는 본문 검색, 약칭 지원 |
| 조문 | `get_fire_law_text` | 법령명과 선택 조 번호 |
| 별표 | `get_fire_law_annex` | 법령명/MST, 별표 번호, 별표 내 키워드 |
| 판례 | `search_fire_precedents` | 법제처 판례 검색. 행정심판을 포함한다고 표시하지 않음 |
| 행정규칙 | `search_fire_admin_rules` | 고시·훈령, NFPC·NFTC 이름/본문 |
| 행정규칙 원문 | `get_fire_admin_rule_text` | 행정규칙 ID/명칭, 절 번호·키워드 |
| 위험물 | `search_hazmat` | 물질명·CAS·UN. 목록 캐시 뒤 로컬 매칭 |

## 데이터·캐시

- 원천 데이터베이스를 저장소나 서버 디스크에 복제하지 않습니다.
- `InMemoryLruCache`는 최대 100개 항목이며 서버 재시작 시 비워집니다.
- 검색 1시간, 조문·시설·위험물 24시간, 확정 과거 통계 최대 7일 등 항목별 TTL을 사용합니다.
- 빈 결과는 캐시하지 않아 원천 데이터 지연 중의 0건이 장시간 고정되지 않게 합니다.
- 대상물/시설의 건물명 검색은 신뢰할 수 없는 `totalCount` 대신 짧은 페이지가 나올 때까지 1,000건 단위로
  순회하고, 반복 페이지·최대 페이지 보호 후 필터합니다.

캐시는 최신성·호출량의 절충입니다. 법적 판단 전에 원천 시스템에서 현재 원문을 다시 확인합니다.

## 인증과 보안 경계

| 경계 | 현재 구현 | 운영 책임 |
|---|---|---|
| `/mcp` | `SERVER_AUTH_TOKEN` Bearer 선택 | 공개 시 반드시 토큰·HTTPS·접근제어 적용 |
| `/api/chat` | `CHAT_AUTH_TOKEN` 또는 서버 토큰, IP 호출 제한 | 사용자별 인증이 필요하면 앞단 IdP/게이트웨이 추가 |
| 정부 API 키 | 서버 env 또는 요청별 헤더, AsyncLocalStorage 격리 | 비밀 저장소·회수·프록시 로그 통제 |
| 요청 크기 | chat 64KiB(최근 문맥 8개), MCP 4MiB | 앞단 프록시에도 더 작은 적정 한도 적용 |
| LLM | 서버 env 키, 1회 기본 30초 제한 | 외부 전송·보존·국외이전·비용 정책 검토 |

`TRUST_PROXY=true`는 신뢰할 수 있는 프록시가 외부의 `X-Forwarded-For`를 제거하고 새로 설정할 때만
사용합니다. 그렇지 않으면 클라이언트가 헤더를 위조해 호출 제한을 우회할 수 있습니다. limiter의 IP 저장소는
10,000개 항목으로 제한되어 고유 IP 유입에 의한 무제한 메모리 증가를 막습니다.

키 마스킹은 애플리케이션이 만드는 URL 포함 오류에 적용됩니다. 상위 프록시·호스팅·운영체제 로그를
자동으로 정리하지는 않습니다. `LAW_API_PROTOCOL=http`는 키를 평문 전송하므로 운영용 안전 대안이 아닙니다.
기본 `HOST`는 `127.0.0.1`이며 외부 주소는 MCP·chat 접속 토큰 없이는 시작을 거부합니다. 브라우저 대화는
장기 `localStorage`가 아닌 현재 탭의 `sessionStorage`에만 저장합니다.

## 네트워크 복원력

- 기본 외부 호출 제한시간은 30초입니다.
- 429/503/504와 서비스별 일시 오류를 지수 백오프로 재시도합니다.
- 법제처에서 관측된 간헐 404는 법제처 호출에 한해 재시도합니다.
- 빈 본문, HTML 점검 페이지, XML/JSON 오류 래퍼를 정상 데이터로 처리하지 않습니다.
- `/health`는 현재 프로세스 생존만 확인하고 공공 API나 LLM의 정상 상태는 확인하지 않습니다.

## 버전 변경 원칙

- 모든 도구는 `allTools[]`에만 등록합니다.
- 사용자 의도를 먼저 실패 테스트로 만들고 수정 뒤 전체 `npm run verify`를 통과합니다.
- 모델명·요금·제품 UI·API 승인/호출 한도 같은 외부 사실은 공식 문서에서 확인하고, 확인하지 못하면
  완료로 쓰지 않습니다.
- 외부 API 실연동, LLM 실호출, Docker 빌드, 원격 MCP 제품 연결은 해당 자격증명·환경에서 별도 검증하고
  검증일과 범위를 [기준.md](기준.md)에 기록합니다.
