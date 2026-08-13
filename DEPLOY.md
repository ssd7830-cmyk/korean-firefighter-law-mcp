# 배포 안내 (인수인계 문서)

이 문서만 보면 배포할 수 있게 작성했습니다. 코드 수정은 필요 없습니다.

## 0. 준비물 — 인증키 2개 (모두 무료)

| 키 | 발급처 | 절차 |
|---|---|---|
| `DATA_GO_KR_KEY` | [공공데이터포털](https://www.data.go.kr) | 회원가입 → 아래 4개 API "활용신청" → 마이페이지에서 인증키 확인 |
| `LAW_OC` | [법제처 국가법령정보 공동활용](https://open.law.go.kr) | OPEN API 신청 → 인증키(OC) 확인 |

활용신청할 소방청 API 5개:
[화재정보서비스](https://www.data.go.kr/data/15077644/openapi.do) ·
[구급통계서비스](https://www.data.go.kr/data/15099428/openapi.do) ·
[특정소방대상물정보](https://www.data.go.kr/data/15155780/openapi.do) ·
[특정소방대상물소방시설정보](https://www.data.go.kr/data/15155779/openapi.do) ·
[국가위험물정보](https://www.data.go.kr/data/15061055/openapi.do)

## 1. 배포 — 셋 중 하나 선택

### A. Docker (기관 내부 서버 권장)

```bash
git clone https://github.com/ssd7830-cmyk/korean-firefighter-law-mcp && cd korean-firefighter-law-mcp
docker build -t firefighter-mcp .
docker run -d -p 8080:8080 -e DATA_GO_KR_KEY="발급키" -e LAW_OC="발급OC" firefighter-mcp
```

확인: `curl http://localhost:8080/health` → `ok`

### B. fly.io (소규모·개인 운영)

```bash
git clone https://github.com/ssd7830-cmyk/korean-firefighter-law-mcp && cd korean-firefighter-law-mcp
fly launch --no-deploy   # 앱 이름 지정
fly secrets set DATA_GO_KR_KEY="발급키" LAW_OC="발급OC"
fly deploy
```

### C. 맨 Node (임시·테스트)

```bash
git clone https://github.com/ssd7830-cmyk/korean-firefighter-law-mcp && cd korean-firefighter-law-mcp
npm ci && npm run build
DATA_GO_KR_KEY="발급키" LAW_OC="발급OC" node build/index.js --mode http
```

## 2. LLM 연결 (챗봇 AI 답변용 — 셋 중 하나만)

서버에는 **챗봇 사이트가 내장**되어 있습니다 (`https://서버주소/` 접속). LLM 키 없이도
"조회 모드"로 동작하지만(질문 → 공식 데이터 조회 결과 원문 표시), 아래 키 중 하나를
환경변수로 넣으면 ChatGPT처럼 자연어로 대답합니다:

| 환경변수 | 발급처 | 비고 |
|---|---|---|
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) | **무료 티어 있음 — 시범 운영 권장.** 무료 티어는 입력이 모델 개선에 활용될 수 있으므로 정식 운영 시 유료 전환 |
| `ANTHROPIC_API_KEY` | [platform.claude.com](https://platform.claude.com) | Claude |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | GPT |

- 여러 키가 있으면 `LLM_PROVIDER=gemini|claude|openai`로 지정, 모델은 `LLM_MODEL`로 변경
- **예산 산정 근거**: 질문 1건 = LLM 호출 1회. 경량 모델(제미나이 플래시 등) 기준 질문당 수 원 수준.
  일 1,000질문 가정 시 월 예산 수만 원대에서 시작해 사용량 보고 조정 권장
- **할루시네이션 차단 구조**: 챗봇은 질문마다 코드가 먼저 공식 데이터를 조회하고,
  LLM은 그 자료 안에서만 답하도록 강제됩니다. 자료 없이 답변이 생성되는 경로는 없습니다

## 3. 사용자(소방관) 안내

**챗봇(권장 — 설치 제로)**: 브라우저에서 `https://서버주소/` 접속 → 바로 채팅.

**AI 커넥터(선택)**: MCP 엔드포인트는 `https://서버주소/mcp`.
- ChatGPT: 설정 → 커넥터(개발자 모드) → 새 커넥터 → URL 입력
- Claude: 설정 → 커넥터 → 커스텀 커넥터 추가 → 같은 URL

"어제 서울 화재 몇 건이야?", "소방시설법 제10조 보여줘" 같은 질문이 바로 됩니다.

## 4. 운영 옵션 (환경변수)

| 변수 | 기본 | 설명 |
|---|---|---|
| `PORT` | 8080 | HTTP 포트 |
| `SERVER_AUTH_TOKEN` | (없음) | 설정하면 `/mcp`에 `Authorization: Bearer <토큰>` 없는 요청 거부. 챗봇 화면(`/`)에는 적용되지 않음 — 챗봇 접근 제한이 필요하면 리버스프록시/내부망에서 처리 |
| `LAW_API_PROTOCOL` | https | 폐쇄망 인증서 문제 시 `http` |

- **HTTPS·도메인**: 리버스프록시(nginx 등)나 플랫폼(fly.io는 자동)에서 처리하세요. 서버 자체는 HTTP만 듣습니다.
- **호출 한도**: 공공데이터포털 개발계정은 API별 일 1천~1만 건. 사용자가 늘면 data.go.kr에 **활용사례 등록 후 운영계정 트래픽 증설**을 신청하세요.
- **개인 키 모드**: 공용 한도가 부족하면, 사용자가 각자 발급한 키를 요청 헤더 `X-Data-Go-Kr-Key` / `X-Law-Oc`로 보내게 할 수 있습니다 (서버 env 키보다 우선 적용).

## 5. 처음 켠 뒤 확인할 것

모든 API의 오퍼레이션명·파라미터는 활용가이드 문서 기준으로 확정되어 실호출 검증까지 끝난 상태입니다 (2026-08-13).
혹시 계정·시점에 따라 특정소방대상물 오퍼레이션명이 다르면 환경변수
`FIRE_BUILDING_OP` / `FIRE_FACILITY_OP`로 교체할 수 있습니다 (코드 수정 불필요).
켠 직후 챗봇에서 "소방시설법 제10조", "2025년 1월 1일 화재 현황", "아세톤 위험물이야?" 세 가지를 던져보면 법제처·통계·위험물 연동이 한 번에 확인됩니다.
