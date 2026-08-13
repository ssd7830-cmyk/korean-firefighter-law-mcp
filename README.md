# korean-firefighter-law-mcp

소방청 공공데이터(화재·구급·소방시설)와 법제처 소방 법령·판례를 AI에서 바로 조회하는 MCP 서버.
소방관계자 실무용.

## 도구 (7개)

| 도구 | 하는 일 | 데이터 출처 |
|---|---|---|
| `search_fire_stats` | 날짜별 화재발생현황 (접수·진행·오인 건수 등) | 소방청 화재정보서비스 |
| `get_ems_stats` | 시도본부·소방서별 구급활동 통계 | 소방청 구급통계서비스 |
| `search_fire_building` | 특정소방대상물(건물) 검색 | 소방청 특정소방대상물정보 |
| `get_building_facilities` | 건물별 소방시설 현황 (스프링클러 등) | 소방청 소방시설정보 |
| `search_fire_law` | 소방 관계 법령 검색 (약칭 지원) | 법제처 국가법령정보 |
| `get_fire_law_text` | 조문 전문 조회 (`"소방시설법" 제10조` 등) | 법제처 국가법령정보 |
| `search_fire_precedents` | 소방 관련 판례 검색 | 법제처 국가법령정보 |

법령 약칭 내장: 화재예방법 → 화재의 예방 및 안전관리에 관한 법률, 소방시설법·위험물법·119법·다중이용업소법 등.

## 설치

```bash
npm install && npm run build
```

## 인증키 (2개, 모두 무료)

1. **공공데이터포털** — [data.go.kr](https://www.data.go.kr) 가입 후 아래 4개 API 활용신청 → 마이페이지의 인증키를 `DATA_GO_KR_KEY`에
   - [화재정보서비스](https://www.data.go.kr/data/15077644/openapi.do) · [구급통계서비스](https://www.data.go.kr/data/15099428/openapi.do) · [특정소방대상물정보](https://www.data.go.kr/data/15155780/openapi.do) · [소방시설정보](https://www.data.go.kr/data/15155779/openapi.do)
2. **법제처** — [open.law.go.kr](https://open.law.go.kr)에서 OPEN API 신청 → `LAW_OC`에

## 실행 모드 2가지

- **stdio (기본)** — 내 컴퓨터의 Claude Desktop/Claude Code에 연결 (아래 설정)
- **HTTP** — 서버 1대 띄우면 세 가지가 한번에 제공됨:
  - **챗봇 사이트** (`/`) — 소방관이 브라우저로 접속해 바로 채팅. 질문마다 공식 데이터를
    먼저 조회하고 그 자료 안에서만 답하는 구조라 할루시네이션이 차단됨.
    LLM 키(제미나이/Claude/GPT 중 택1)를 꽂으면 AI 답변, 없으면 조회 결과 원문 표시
  - **챗봇 API** (`POST /api/chat`)
  - **MCP 엔드포인트** (`/mcp`) — ChatGPT·Claude 커넥터 연결용

  배포 절차·LLM 연결·운영 옵션은 **[DEPLOY.md](DEPLOY.md)** 참조 (기관 인수인계용 문서)

```bash
node build/index.js --mode http   # PORT env로 포트 지정 (기본 8080)
```

## Claude Desktop / Claude Code 연결 (stdio)

```json
{
  "mcpServers": {
    "firefighter-law": {
      "command": "node",
      "args": ["/절대경로/korean-firefighter-law-mcp/build/index.js"],
      "env": {
        "DATA_GO_KR_KEY": "발급받은 키",
        "LAW_OC": "발급받은 OC"
      }
    }
  }
}
```

## 알려진 미확인 사항

- 특정소방대상물 2개 서비스의 **오퍼레이션명**은 활용신청 후 받는 활용가이드 문서 기준으로 확정해야 한다.
  404가 나면 [src/tools/fire-building.ts](src/tools/fire-building.ts) 상단 상수(또는 env `FIRE_BUILDING_OP` / `FIRE_FACILITY_OP`)를 가이드의 오퍼레이션명으로 교체.
- 구급통계는 현재 "교통사고 구급활동" 오퍼레이션만 연결됨 (서비스에 오퍼레이션이 더 있음).

## 참고

- 일일 호출 한도: 개발계정 기준 화재정보 1만/일, 나머지 1천/일. 한도가 실측으로 부족해지면 `CacheStore` 인터페이스에 SQLite 구현을 붙인다 ([ARCHITECTURE.md](ARCHITECTURE.md) 참조).
- 법제처 API 계정·키 문제 없이 검색이 전부 실패하면: Referer 차단(자동 주입됨), 도메인/IP 등록, `LAW_API_PROTOCOL=http` 순으로 확인.
