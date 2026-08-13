# korean-firefighter-law-mcp — 아키텍처 설계

> 현행 아키텍처 (v0.4 반영) | 2026-08

소방 데이터 3덩어리(화재·구급 통계 + 소방시설 정보 + 소방 법령)를 AI가 바로 쓸 수 있는
MCP 도구로 묶는다. HTTP 모드에서는 같은 도구 위에 소방관용 챗봇 페이지를 얹는다.

---

## 핵심 결정사항

| 결정 | 선택 | 이유 |
|---|---|---|
| 언어/런타임 | TypeScript + Node.js | MCP SDK 성숙도 최고 |
| 데이터 방식 | **API 실시간 호출** (DB 미배포) | 법령·통계는 원본이 계속 갱신됨. 재배포 책임 없음 |
| 캐시 | **인메모리 LRU + TTL만** (SQLite 없음) | MVP에 디스크 캐시는 과설계. 단 `CacheStore` 인터페이스로 분리해두고, data.go.kr 일일 호출 한도가 실제 문제 되면 그때 SQLite 구현체로 교체 |
| 인터페이스 | MCP stdio + Streamable HTTP (v0.3~) | 로컬 Claude 연동 + 기관 서버 배포·챗봇 |
| 스키마 검증 | Zod → MCP JSON Schema 변환 | 타입 안전 + 런타임 검증 동시 확보 |

---

## High-Level 구조

```
┌──────────────────────────────────────────────────────┐
│    MCP Client (Claude·ChatGPT) │ 브라우저 (챗봇)      │
└───────────────┬──────────────────┬───────────────────┘
           stdio 모드         HTTP 모드 (v0.3~)
                │             GET / · POST /api/chat · /mcp
┌───────────────▼──────────────────▼───────────────────┐
│         korean-firefighter-law-mcp Server            │
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  HTTP 계층 (src/server/ + src/web/, v0.3~0.4)  │  │
│  │  • http-server.ts   (Streamable HTTP stateless)│  │
│  │  • factory.ts       (클라이언트·MCP 서버 조립)  │  │
│  │  • chat-pipeline.ts (질문→조회→자료 기반 답변)  │  │
│  │  • query-router.ts  (규칙 라우팅 — 폴백)        │  │
│  │  • llm-router.ts    (LLM 질문 해석, 키 있을 때)│  │
│  │  • llm-adapter.ts   (Gemini/Claude/GPT 택1)    │  │
│  │  • web/chat-page.ts (챗봇 화면 HTML)           │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │   Tool Registry (tool-registry.ts → allTools[])│  │
│  │   통계(2)│시설(2)│법령·규칙(4)│위험물(1)      │  │
│  └────────────────────────────────────────────────┘  │
│                        ▲                             │
│  ┌────────────────────────────────────────────────┐  │
│  │            Shared Libraries (src/lib/)          │  │
│  │  • fire-api-client.ts  (data.go.kr 소방청 API) │  │
│  │  • law-api-client.ts   (법제처 API, 소방 프리셋)│  │
│  │  • fetch-with-retry.ts (타임아웃+재시도+백오프) │  │
│  │  • cache.ts            (CacheStore + 메모리LRU)│  │
│  │  • request-context.ts  (요청별 인증키 격리)     │  │
│  │  • xml.ts / format.ts  (XML 파싱·응답 포맷)    │  │
│  │  • search-normalizer.ts / errors.ts            │  │
│  └────────────────────────────────────────────────┘  │
└──────────┬───────────────────────────┬───────────────┘
           │ HTTPS                     │ HTTPS
           ▼                           ▼
┌─────────────────────┐   ┌─────────────────────────────┐
│  공공데이터포털      │   │  법제처 국가법령정보 API      │
│  (apis.data.go.kr)  │   │  (law.go.kr/DRF)            │
├─────────────────────┤   ├─────────────────────────────┤
│ 화재정보서비스        │   │ lawSearch.do (소방 법령 검색)│
│ 구급통계서비스        │   │ lawService.do (조문 조회)    │
│ 특정소방대상물정보    │   │ 판례·행정규칙 (소방 필터)     │
│ 소방시설정보          │   └─────────────────────────────┘
│ 국가위험물정보        │
└─────────────────────┘
```

---

## 인증 (환경변수 2개)

```bash
# 공공데이터포털 인증키 — data.go.kr 회원가입 → 각 API 활용신청
DATA_GO_KR_KEY=...

# 법제처 Open API 인증키 — open.law.go.kr 발급
LAW_OC=...
```

로그인·세션 없음. 두 키 모두 URL 파라미터로 전달 (data.go.kr은 `serviceKey=`, 법제처는 `OC=`).
로그·에러 메시지에서 키 마스킹 필수 (`maskSensitiveUrl`).

---

## 도구 세트 (9개)

### 통계 (data.go.kr)
| 도구 | 하는 일 |
|---|---|
| `search_fire_stats` | 날짜·지역별 화재 발생 건수, 인명·재산 피해 조회 |
| `get_ems_stats` | 시도본부·소방서·안전센터별 구급 출동 통계 |

### 소방시설 (data.go.kr)
| 도구 | 하는 일 |
|---|---|
| `search_fire_building` | 특정소방대상물(건물) 검색 — 이름·주소·용도별 |
| `get_building_facilities` | 건물별 소방시설 현황·완공일·좌표 조회 |

### 법령 (법제처, 소방 도메인 프리셋)
| 도구 | 하는 일 |
|---|---|
| `search_fire_law` | 소방 법령 검색. 소방 6법 별칭 내장(아래) |
| `get_fire_law_text` | 조문 단위 전문 조회 (`제10조` 등 지정) |
| `search_fire_precedents` | 소방 관련 판례·행정심판 검색 |
| `search_fire_admin_rules` | 행정규칙(고시·훈령) 검색 — 화재안전기준 NFPC·NFTC. 이름 0건 시 본문검색 폴백 (법령 검색도 동일) |

### 위험물 (data.go.kr)
| 도구 | 하는 일 |
|---|---|
| `search_hazmat` | 위험물 검색 — 물질명·CAS·UN번호로 품명(류별)·물성·대응요령. 목록 전체(약 7,300건) 1회 호출 후 24h 캐시 |

소방 법령 별칭 프리셋 (`search-normalizer`에 내장):
소방기본법 / 화재의 예방 및 안전관리에 관한 법률(화재예방법) /
소방시설 설치 및 관리에 관한 법률(소방시설법) / 소방시설공사업법 /
위험물안전관리법 / 119구조·구급에 관한 법률 / 소방공무원법 + 각 시행령·시행규칙

### 체인 도구 (v0.2 — 보류, 미구현)
| 도구 | 하는 일 |
|---|---|
| `check_building_compliance` | `get_building_facilities` + `get_fire_law_text` 결합: 건물 시설 현황 ↔ 법령 의무사항 대조 리포트 |

---

## 디렉터리 구조

```
korean-firefighter-law-mcp/
├── src/
│   ├── index.ts              # 엔트리: stdio(기본) | --mode http
│   ├── version.ts
│   ├── tool-registry.ts      # allTools[] 중앙 등록 + Zod→JSON Schema 변환
│   ├── lib/
│   │   ├── fire-api-client.ts / law-api-client.ts
│   │   ├── fetch-with-retry.ts / cache.ts / request-context.ts
│   │   └── xml.ts / format.ts / search-normalizer.ts / errors.ts
│   ├── tools/
│   │   ├── fire-stats.ts / ems-stats.ts / fire-building.ts / hazmat.ts
│   │   └── fire-law.ts / fire-precedents.ts / fire-admin-rules.ts
│   ├── server/               # HTTP 모드 전용 (v0.3~0.4)
│   │   ├── http-server.ts    # Streamable HTTP stateless (/ · /api/chat · /mcp)
│   │   ├── factory.ts        # 클라이언트·MCP 서버 조립
│   │   ├── chat-pipeline.ts  # 질문 → 무조건 조회 → 자료 기반 답변
│   │   ├── query-router.ts   # 규칙 라우팅 (LLM 없음·실패 시 폴백)
│   │   ├── llm-router.ts     # LLM 라우팅 — 질문을 도구+인자 JSON으로 해석
│   │   └── llm-adapter.ts    # Gemini/Claude/GPT 키 자동 감지
│   └── web/
│       └── chat-page.ts      # 챗봇 화면 (단일 HTML 문자열)
├── .env.example
├── Dockerfile
├── package.json / tsconfig.json
└── README.md / DEPLOY.md / ARCHITECTURE.md / 기준.md
```

테스트는 별도 `test/` 폴더 없이 소스 옆 `*.test.ts`로 병치한다 (vitest).

원칙:
1. Tools → Shared Libs → API Client 단방향 의존
2. 파일당 200줄 미만, 단일 책임
3. 도구는 `{ name, description, schema, handler }`로 `allTools[]`에만 등록
4. TypeScript strict + Zod 검증

---

## 네트워크 방어층

| 문제 | 대응 |
|---|---|
| 법제처 DRF 간헐 404 (버스트 스로틀) | 404/429/503/504 재시도 + exponential backoff |
| 법제처 `Referer` 없는 요청 거부 | law.go.kr 호출 시 기본 Referer 자동 주입 |
| 200 상태에 빈 본문/HTML 점검 페이지 | 빈/HTML 응답 감지 → 재시도 → 명확한 에러 메시지 |
| data.go.kr 일일 호출 한도 (1천~1만/일) | 캐시 TTL 차등: 검색 1h / 조문 24h / **확정 연도 통계 7d** |
| API 키 로그 유출 | 에러·로그 URL에서 `serviceKey=***`, `OC=***` 마스킹 |

---

## 캐시 전략

```typescript
interface CacheStore {
  get<T>(key: string): T | undefined
  set<T>(key: string, data: T, ttlMs: number): void
}
```

- 현행: `InMemoryLruCache` (최대 100건)
- TTL: 법령 검색 1시간 / 조문 24시간 / 시설정보 24시간 / 과거 연도 확정 통계 7일
- SQLite는 **일일 호출 한도가 실측으로 문제 될 때만** `SqliteCacheStore`로 추가.
  도구·클라이언트 코드는 인터페이스만 보므로 교체 비용 0

---

## 로드맵

- **v0.1 (MVP)** ✅: stdio MCP + 도구 7개 + 인메모리 캐시 + 재시도 방어층
- **v0.3 (HTTP)** ✅: Streamable HTTP stateless 서버 + 요청별 키 격리(AsyncLocalStorage) + Bearer 토큰 보호 + Docker/DEPLOY.md 인수인계 패키지 — ChatGPT·Claude 커넥터 연결 가능
- **v0.4 (챗봇)** ✅: 소방관용 챗봇 페이지(`/`) + 질문→무조건 조회→자료 기반 답변 파이프라인 + LLM 3사 어댑터 (키 없으면 조회 모드)
- **LLM 라우팅** ✅ 구현: LLM 키가 있으면 질문 해석(도구·인자 선택)도 LLM이 담당 — 도구 스키마·법령 사전을 프롬프트로 주입, 실패·무키 시 규칙 라우터 폴백. 실 LLM 라우팅 품질은 키 발급 후 확인 필요
- **v0.2 (보류)**: `check_building_compliance` 체인 도구, CLI 인터페이스, 별표/서식 조회 — 실데이터 검증(키 발급) 후 진행
- **이후**: 필요 시 SQLite 캐시 (`CacheStore` 교체)
