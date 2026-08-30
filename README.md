# korean-firefighter-law-mcp

> v0.8.0 · 소방기관 검토·시범운영용 · 공개 저장소 (MIT)
>
> 기관 도입 전 검토·시범운영을 전제로 공개합니다. 운영 승인 전 확인이 필요한 항목은
> [기준.md 6장](기준.md)에 그대로 남겨 두었습니다.

소방청 공공데이터와 법제처 국가법령정보를 조회해 AI가 소방 법령·화재통계·교통사고 구급통계·
특정소방대상물·소방시설·위험물 질문에 공식 자료를 근거로 답하도록 연결하는 MCP 서버입니다.

이 저장소의 목적은 소방기관이 코드를 직접 검토한 뒤 다음 두 방식 중 기관 환경에 맞는 방식으로
시범 적용할 수 있게 하는 것입니다. 소방청 또는 법제처의 공식 제품은 아닙니다.

## 도입 방식 두 가지

| 방식 | 사용자 경험 | 기관이 운영할 것 | 안내 문서 |
|---|---|---|---|
| **기관 서버형** | 브라우저 채팅 또는 기관 서비스가 API 호출 | 서버 1대, 정부 API 키, 선택한 LLM API 키 | [DEPLOY.md](DEPLOY.md) |
| **개별 PC 설치형** | PC의 stdio 지원 AI 클라이언트에서 도구 사용 | 각 PC의 프로그램과 정부 API 키 | [LOCAL_SETUP.md](LOCAL_SETUP.md) |

기관 서버형은 `GET /` 웹 채팅, `POST /api/chat`, `POST /mcp`를 제공합니다. 웹 채팅과 `/api/chat`은
LLM이 질문을 공식 API 호출 계획(1~4건)으로 바꾸고 조회 자료로 답변을 작성하므로 LLM 설정이
필수입니다. LLM이 없으면 챗봇은 503으로 비활성화되고 `/mcp`만 동작합니다. 답변은 조회 자료에 있는
내용만으로 구조화된 존댓말로 작성되며 주장·수치 문장에 근거 자료 번호(`[자료 N]`)를 인용합니다(서버가
인용 유효성 검증). 자료가 부족하면 1라운드에 한해 스스로 추가 조회하고, 그래도 없는 데이터는 공식
안내처를 권합니다. 공식 조회 원문은 응답의 `sources` 필드로 항상 함께 제공되며 화면에서는 접이식으로
표시됩니다.

개별 PC 설치형은 중앙 서버와 별도 LLM API 키가 필요 없습니다. 연결한 AI 클라이언트가 답변을 만들고 이
프로그램은 stdio MCP 도구로 공식 API를 조회합니다. ChatGPT는 로컬 MCP 서버에 직접 연결하지 않으므로
ChatGPT를 사용할 때는 기관 서버형의 원격 MCP 또는 웹/API 방식을 검토해야 합니다.

### 설치 방법 두 가지

이 프로그램은 npm에 게시되어 있어 내려받기·빌드 없이 바로 실행할 수 있습니다.

```bash
npx korean-firefighter-law-mcp
```

AI 클라이언트의 MCP 설정에도 같은 방식으로 등록합니다. 경로를 지정할 필요가 없습니다.

```json
{
  "mcpServers": {
    "firefighter-law": {
      "command": "npx",
      "args": ["-y", "korean-firefighter-law-mcp"],
      "env": {
        "DATA_GO_KR_KEY": "발급받은 키",
        "LAW_OC": "발급받은 OC"
      }
    }
  }
}
```

코드를 직접 검토하거나 수정해서 운영하려면 저장소를 내려받아 빌드합니다. 기관 심사·내부 배포에는
이 방식을 권합니다. 절차는 [LOCAL_SETUP.md](LOCAL_SETUP.md)와 [DEPLOY.md](DEPLOY.md)에 있습니다.

[MCP 공식 레지스트리](https://registry.modelcontextprotocol.io)에는
`io.github.ssd7830-cmyk/korean-firefighter-law-mcp`로 등재되어 있습니다.

## 제공 도구 11개

| 도구 | 범위 | 공식 데이터 출처 |
|---|---|---|
| `search_fire_stats` | 날짜별 화재 접수·진행·오인·자체진화 현황 | 소방청 화재정보서비스 |
| `get_ems_stats` | 시도본부·소방서별 **교통사고** 구급활동 통계 | 소방청 구급통계서비스 |
| `search_fire_building` | 시도·건물명·사용승인연도별 특정소방대상물 검색 | 소방청 특정소방대상물정보 |
| `get_building_facilities` | 특정소방대상물의 소방시설 현황 | 소방청 소방시설정보 |
| `search_fire_law` | 소방 관계 법령 이름·본문 검색 | 법제처 국가법령정보 |
| `get_fire_law_text` | 법령 조문 전문 조회 | 법제처 국가법령정보 |
| `get_fire_law_annex` | 시행령 등 법령 별표 원문·키워드 조회 | 법제처 국가법령정보 |
| `search_fire_precedents` | 소방 관련 판례 검색 | 법제처 국가법령정보 |
| `search_fire_admin_rules` | 행정규칙·화재안전기준(NFPC·NFTC) 검색 | 법제처 국가법령정보 |
| `get_fire_admin_rule_text` | NFPC·NFTC 행정규칙 원문·절 조회 | 법제처 국가법령정보 |
| `search_hazmat` | 물질명·CAS·UN번호별 위험물 정보 | 소방청 국가위험물정보 |

법령 약칭(화재예방법·소방시설법·위험물법·119법 등)을 정식 명칭으로 바꾸며, 법령·행정규칙 이름
검색이 0건이면 본문 검색으로 전환합니다. 본문 검색은 전량(최대 100건)을 받아 소방·건축 소관
관련도순으로 재정렬해 표시하고, 총 건수 대비 표시 건수를 명시합니다.

## 빠른 코드 검증

Node.js 22 이상이 필요하며 새 설치에는 현재 LTS인 Node.js 24를 권장합니다.

```bash
git clone https://github.com/ssd7830-cmyk/korean-firefighter-law-mcp.git
cd korean-firefighter-law-mcp
npm ci
npm run verify
```

`verify`는 타입검사, 전체 자동 테스트, 배포 빌드를 차례로 실행합니다. 실제 정부 API 호출은 인증키와
활용승인이 있어야 하므로 [DEPLOY.md](DEPLOY.md)의 배포 전 실연동 점검을 별도로 수행해야 합니다.

## 필요한 정부 API 키

1. [공공데이터포털](https://www.data.go.kr)에서 다음 5개 API를 활용신청하고 `DATA_GO_KR_KEY`를 설정합니다.
   [화재정보](https://www.data.go.kr/data/15077644/openapi.do) ·
   [구급통계](https://www.data.go.kr/data/15099428/openapi.do) ·
   [특정소방대상물](https://www.data.go.kr/data/15155780/openapi.do) ·
   [소방시설](https://www.data.go.kr/data/15155779/openapi.do) ·
   [국가위험물정보](https://www.data.go.kr/data/15061055/openapi.do)
2. [법제처 국가법령정보 공동활용](https://open.law.go.kr)에서 OPEN API를 신청하고 `LAW_OC`를 설정합니다.

승인 방식, 호출 한도, 유효기간은 바뀔 수 있으므로 저장소의 숫자보다 각 발급 계정과 API 상세 페이지의
현재 표시를 기준으로 합니다.

## 안전 설계와 운영상 주의

- 조회 자료 없이 LLM이 답을 생성하는 경로를 두지 않습니다. 조회 실패 시 오류 또는 조회 원문을 표시합니다.
- 서버는 기본적으로 `127.0.0.1`에만 열리고, 외부 주소 바인딩은 접속 토큰 없이는 시작을 거부합니다.
- API 키는 환경변수 또는 HTTPS 요청 헤더로만 받고, 애플리케이션 오류의 키 값은 마스킹합니다.
- 데이터베이스를 배포하지 않습니다. 공식 API를 호출하고 항목별 TTL의 인메모리 캐시만 사용합니다.
- `/mcp`와 `/api/chat`은 운영 시 토큰과 HTTPS로 보호해야 합니다. 자세한 설정은 [DEPLOY.md](DEPLOY.md)에 있습니다.
- 기관 서버형 챗봇은 사용자 질문과 조회 자료를 선택한 외부 LLM 사업자로 전송합니다. 기관의 개인정보·보안·
  기록물 정책 검토 전에는 민감정보나 개인정보를 입력하지 않습니다. LLM 사용을 승인하지 않는 기관은 웹
  챗봇 대신 `/mcp` 원격 도구 또는 개별 PC 설치형(클라이언트 LLM 사용)을 검토합니다.
- 이 프로그램의 결과는 실무 검토 보조자료입니다. 법적 판단과 현장 안전 판단은 공식 원문·기관 지침과
  담당자의 검토를 대신하지 않습니다.

보안 구조와 제한은 [ARCHITECTURE.md](ARCHITECTURE.md), 취약점 신고와 운영 기본선은
[SECURITY.md](SECURITY.md), 변경 의도와 검증 이력은 [기준.md](기준.md), 운영 인계 절차는
[인수인계.md](인수인계.md)에 기록합니다.

## 현재 검증 상태

- 자동 테스트·타입검사·빌드는 현재 소스에서 재실행합니다. 결과 수는 `npm run verify` 출력이 기준입니다.
- 검색 재정렬·조문 키워드 추출·추가 조회 라운드·화면 개편의 검증 이력과 12문항 실사용 감사 결과는
  [기준.md](기준.md) 3-3~3-6에, 남은 개선 순서는 [인수인계.md](인수인계.md) 16장에 기록되어 있습니다.
- 실제 Gemini·Claude·OpenAI API 호출, Docker 이미지 빌드, ChatGPT/Claude 원격 MCP UI 연결은 현재 환경에서
  재검증하지 못했습니다. 문서에 완료로 표시하지 않으며 기관 시험 환경에서 확인해야 합니다.
- 로컬 개발용 `claude-cli`와 `codex-cli` 어댑터가 있지만 개인 로그인을 공유 서버 운영에 사용하지 않습니다.
- 구급통계는 전체 구급활동이 아니라 **교통사고 구급활동** 범위만 연결되어 있습니다.

## 라이선스

[MIT License](LICENSE). 정부 원천 데이터의 이용조건은 각 제공기관의 현재 조건을 별도로 따릅니다.
