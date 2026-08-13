# 기관 서버형 배포 안내

> 적용 버전: v0.6.0 / 대상: 기관 서버·시범운영 담당자

기관 서버형은 서버 한 대에서 다음 인터페이스를 제공합니다.

- `GET /` — 브라우저용 소방 AI 도우미
- `POST /api/chat` — 기관 서비스가 호출할 자연어 질의 API
- `POST /mcp` — 원격 Streamable HTTP MCP
- `GET /health` — 생존 확인
- `GET /status` — 조회/LLM 모드와 실제 공급자·모델 확인

각 PC에 설치하려면 [LOCAL_SETUP.md](LOCAL_SETUP.md)를 사용합니다.

## 1. 배포 전 의사결정

1. 외부 인터넷에 공개할지, 기관망에서만 제공할지 정합니다.
2. 정부 API 계정·키의 소유자와 갱신 담당자를 기관 명의로 정합니다.
3. LLM을 사용할 경우 질문과 조회 자료가 외부 LLM 사업자로 전송되는 것을 기관 정책상 허용할지 검토합니다.
4. 개인정보·민감정보 입력 금지 안내, 이용자 범위, 로그 보존, 사고 대응 절차를 정합니다.
5. ChatGPT/Claude 원격 MCP를 쓸 경우 해당 서비스의 요금제·관리자 권한·인증 방식과 기관 승인 여부를
   현재 공식 문서로 다시 확인합니다.

LLM은 선택입니다. 설정하지 않으면 질문을 규칙으로 분류하고 공식 API 조회 결과 원문만 보여줍니다.

## 2. 정부 API 키 준비

| 변수 | 발급처 | 사용 범위 |
|---|---|---|
| `DATA_GO_KR_KEY` | [공공데이터포털](https://www.data.go.kr) | 화재·교통사고 구급·대상물·시설·위험물 |
| `LAW_OC` | [법제처 국가법령정보 공동활용](https://open.law.go.kr) | 법령·조문·판례·행정규칙 |

공공데이터포털에서는 다음 5개 API를 각각 활용신청합니다.

[화재정보서비스](https://www.data.go.kr/data/15077644/openapi.do) ·
[구급통계서비스](https://www.data.go.kr/data/15099428/openapi.do) ·
[특정소방대상물정보](https://www.data.go.kr/data/15155780/openapi.do) ·
[특정소방대상물소방시설정보](https://www.data.go.kr/data/15155779/openapi.do) ·
[국가위험물정보](https://www.data.go.kr/data/15061055/openapi.do)

비용·승인·트래픽·유효기간은 변경될 수 있으므로 각 상세 페이지와 발급 계정의 현재 표시를 기준으로 합니다.

## 3. Docker 배포

Docker가 설치된 서버에서 실행합니다.

```bash
git clone https://github.com/ssd7830-cmyk/korean-firefighter-law-mcp.git
cd korean-firefighter-law-mcp
cp .env.example .env
chmod 600 .env
```

`.env`에 다음 값을 입력합니다. 토큰은 충분히 긴 무작위 값으로 만들고 MCP용과 브라우저용을 분리합니다.

```dotenv
DATA_GO_KR_KEY=발급받은키
LAW_OC=발급받은OC
SERVER_AUTH_TOKEN=MCP용-긴-무작위-토큰
CHAT_AUTH_TOKEN=브라우저용-별도-긴-무작위-토큰
```

```bash
docker build -t firefighter-mcp:v0.6.0 .
docker run -d --name firefighter-mcp --restart=unless-stopped \
  -p 127.0.0.1:8080:8080 --env-file .env firefighter-mcp:v0.6.0
curl http://127.0.0.1:8080/health
```

정상이면 `ok`를 반환합니다. 예시는 호스트의 루프백에만 바인딩합니다. Nginx·기관 로드밸런서 등에서
TLS를 종료하고 인증·접근제어를 적용한 뒤 외부에 노출합니다. 서버 자체는 TLS를 제공하지 않습니다.
컨테이너 내부는 `HOST=0.0.0.0`으로 수신하며, 외부 주소 수신은 접속 토큰이 없으면 시작 단계에서 거부됩니다.

Docker를 쓰지 않는 시험 환경에서는 Node.js 22 이상으로 `npm ci`, `npm run verify` 후 아래처럼 실행합니다.

```bash
DATA_GO_KR_KEY="키" LAW_OC="OC" \
SERVER_AUTH_TOKEN="MCP토큰" CHAT_AUTH_TOKEN="챗토큰" \
node build/index.js --mode http
```

이 방식은 터미널이 종료되면 서버도 종료되므로 서비스 운영에는 프로세스 관리자나 컨테이너를 사용합니다.

## 4. LLM 연결

다음 중 하나의 키를 서버 환경변수로 설정합니다.

| 변수 | 공급자 | 현재 기본 모델 |
|---|---|---|
| `GEMINI_API_KEY` | [Gemini 모델 문서](https://ai.google.dev/gemini-api/docs/latest-model) | `gemini-3.6-flash` |
| `ANTHROPIC_API_KEY` | [Claude 모델 문서](https://platform.claude.com/docs/en/about-claude/models/overview) | `claude-sonnet-5` |
| `OPENAI_API_KEY` | [OpenAI 모델 문서](https://developers.openai.com/api/docs/models/all) | `gpt-5.6-luna` |

여러 키가 있으면 `LLM_PROVIDER=gemini|claude|openai`로 선택하고, `LLM_MODEL`로 기관이 검증한 모델 ID를
고정할 수 있습니다. 모델 수명과 가격은 자주 바뀌므로 공급자의 현재 모델·가격·데이터 통제 문서를 기준으로
예산과 갱신 일정을 정합니다. 질문 1건은 라우팅과 답변에 최대 2회 LLM 호출을 사용합니다.

LLM을 켜도 자유 요약문은 표시하지 않습니다. 모델은 관련 근거 구절만 고르고, 서버가 조회 원문과 글자 단위로
일치하는 구절만 통과시킵니다. 공식 조회 원문도 함께 표시하며 이 결과 역시 기관의 공식 해석은 아닙니다.

로컬 개발·시연에는 `LLM_PROVIDER=claude-cli` 또는 `codex-cli`를 명시할 수 있습니다. CLI 질문은 stdin으로
전달되고 세션 비저장·제한 모드로 실행되지만, 개인 로그인을 공유하는 방식이므로 기관 서버 운영은 위 API
키 방식으로 배포합니다. Codex 비대화형 실행 플래그는 [공식 OpenAI CLI 명령 문서](https://developers.openai.com/codex/cli/reference)를 따릅니다.

## 5. 환경변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8080` | HTTP 포트. 1~65535 정수를 사용 |
| `HOST` | `127.0.0.1` | 수신 주소. 외부 주소는 인증 토큰 필수 |
| `SERVER_AUTH_TOKEN` | 없음 | `/mcp` Bearer 토큰 |
| `CHAT_AUTH_TOKEN` | `SERVER_AUTH_TOKEN` | `/api/chat` 전용 Bearer 토큰 |
| `CHAT_RATE_LIMIT_PER_MINUTE` | `60` | 식별 IP별 고정 1분 구간 요청 한도 |
| `TRUST_PROXY` | `false` | 신뢰할 수 있는 프록시 뒤에서만 `true`; 첫 `X-Forwarded-For`를 사용 |
| `LLM_PROVIDER` | 키 자동감지 | `gemini`, `claude`, `openai`, 개발용 `claude-cli`, `codex-cli` |
| `LLM_MODEL` | 공급자별 위 표 | 사용할 모델 ID |
| `LLM_TIMEOUT_MS` | `30000` | LLM 1회 호출 제한시간(ms) |
| `LLM_MAX_CONCURRENCY` | `2` | 동시에 실행할 LLM/CLI 호출 수 |
| `LLM_MAX_QUEUE` | `20` | 대기시킬 최대 LLM/CLI 요청 수 |
| `FIRE_BUILDING_OP` | 코드 기본값 | 대상물 API 오퍼레이션 변경 시 대체 |
| `FIRE_FACILITY_OP` | 코드 기본값 | 시설 API 오퍼레이션 변경 시 대체 |
| `LAW_REFERER` | `https://www.law.go.kr/` | 법제처 요청 Referer |
| `LAW_API_PROTOCOL` | `https` | 비암호화 `http`는 키가 평문 전송되므로 운영 사용 금지 |

`X-Data-Go-Kr-Key`, `X-Law-Oc` 요청 헤더의 개인 키 우선 기능은 `/mcp`와 `/api/chat`에 적용됩니다.
다만 서버로 키를 보내므로 반드시 HTTPS를 사용하고, 중간 프록시가 해당 헤더를 로그하지 않도록 설정합니다.
애플리케이션은 키를 마스킹하지만 운영체제·프록시·호스팅 사업자의 로그까지 통제하지는 못합니다.

## 6. 원격 MCP 연결

MCP URL은 `https://기관주소/mcp`입니다.

- [ChatGPT의 커스텀 MCP 앱](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta)은
  로컬 서버에 직접 연결하지 않습니다. 현재 지원 요금제, 관리자/개발자 모드,
  앱 생성 화면, 인증 방식을 확인한 뒤 시험 워크스페이스에서 도구 스캔을 통과해야 합니다.
- [Claude의 원격 커스텀 커넥터](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)도
  서비스별 관리자 정책과 인증 방식을 확인해야 합니다.
- 이 서버의 단순 Bearer 토큰을 각 제품의 UI가 직접 수용하는지는 현재 환경에서 종단간 검증하지 못했습니다.
  지원되지 않으면 기관 OAuth/OIDC 게이트웨이를 앞단에 두거나, 해당 제품이 제공하는 보안 터널·보관소 방식을
  별도로 구현해야 합니다.

따라서 URL 입력만으로 연동 완료라고 간주하지 않습니다. 도구 11개 스캔, 인증 실패/만료, 실제 도구 호출,
권한 회수까지 시험해야 합니다.

## 7. 배포 전 검증

```bash
npm ci
npm run verify
curl http://127.0.0.1:8080/health
```

그 뒤 브라우저 또는 `/api/chat`에서 다음 질문을 실행합니다.

1. `소방시설법 제10조` — 법제처 조문
2. `2025년 1월 1일 화재 현황` — 소방청 화재정보
3. `아세톤 위험물이야?` — 소방청 위험물정보
4. `인천 2025년 1월 교통사고 구급 통계` — `인천소방본부` 매핑과 교통사고 범위 표시
5. `광주 2026년 8월 교통사고 구급 통계` — 통합 후 본부명이 실제 API에서 조회되는지 확인
6. 기관이 실제로 쓸 건물·시설 질문 — 시도 전체 페이지 검색과 시설 라우팅 확인
7. `아파트 스프링클러 설치 기준` — 시행령 별표 4, NFPC 103, NFTC 103 원문이 함께 조회되는지 확인

실패 응답, 빈 결과, 최근 데이터 지연은 자동 테스트만으로 판정할 수 없습니다. 원천 API 페이지·활용승인·
트래픽과 비교하고 검증일·질문·결과를 [기준.md](기준.md)에 남깁니다.

## 8. 운영 점검

- 매일 또는 모니터링 시스템에서 `/health`를 확인합니다. 현재 health는 프로세스 생존만 확인하며 외부 API
  정상 여부까지 확인하지 않습니다.
- 월 1회 위 실질문, API 사용량, LLM 비용, 토큰 접근권한을 확인합니다.
- 업데이트는 별도 시험 환경에서 `git pull --ff-only`, `npm ci`, `npm run verify`, Docker 빌드, 실연동 검증을
  마친 뒤 배포합니다. ChatGPT 앱은 도구 변경이 자동 반영되지 않을 수 있으므로 관리자 재검토가 필요합니다.
- 토큰이나 API 키가 노출되면 즉시 회수·재발급하고 프록시·호스팅 로그까지 확인합니다.
