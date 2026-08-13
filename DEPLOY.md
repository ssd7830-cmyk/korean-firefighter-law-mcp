# 배포 안내 (인수인계 문서)

이 문서만 보면 배포할 수 있게 작성했습니다. 코드 수정은 필요 없습니다.

## 0. 준비물 — 인증키 2개 (모두 무료)

| 키 | 발급처 | 절차 |
|---|---|---|
| `DATA_GO_KR_KEY` | [공공데이터포털](https://www.data.go.kr) | 회원가입 → 아래 4개 API "활용신청" → 마이페이지에서 인증키 확인 |
| `LAW_OC` | [법제처 국가법령정보 공동활용](https://open.law.go.kr) | OPEN API 신청 → 인증키(OC) 확인 |

활용신청할 소방청 API 4개:
[화재정보서비스](https://www.data.go.kr/data/15077644/openapi.do) ·
[구급통계서비스](https://www.data.go.kr/data/15099428/openapi.do) ·
[특정소방대상물정보](https://www.data.go.kr/data/15155780/openapi.do) ·
[특정소방대상물소방시설정보](https://www.data.go.kr/data/15155779/openapi.do)

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

## 2. 사용자(소방관) 안내

배포된 주소가 `https://서버주소` 라면, MCP 엔드포인트는 `https://서버주소/mcp` 입니다.

- **ChatGPT**: 설정 → 커넥터(개발자 모드) → 새 커넥터 → URL에 `https://서버주소/mcp`
- **Claude**: 설정 → 커넥터 → 커스텀 커넥터 추가 → 같은 URL

등록 후 "어제 서울 화재 몇 건이야?", "소방시설법 제10조 보여줘" 같은 질문이 바로 됩니다.

## 3. 운영 옵션 (환경변수)

| 변수 | 기본 | 설명 |
|---|---|---|
| `PORT` | 8080 | HTTP 포트 |
| `SERVER_AUTH_TOKEN` | (없음) | 설정하면 `Authorization: Bearer <토큰>` 없는 요청 거부. 공개 URL이면 설정 권장 |
| `LAW_API_PROTOCOL` | https | 폐쇄망 인증서 문제 시 `http` |

- **HTTPS·도메인**: 리버스프록시(nginx 등)나 플랫폼(fly.io는 자동)에서 처리하세요. 서버 자체는 HTTP만 듣습니다.
- **호출 한도**: 공공데이터포털 개발계정은 API별 일 1천~1만 건. 사용자가 늘면 data.go.kr에 **활용사례 등록 후 운영계정 트래픽 증설**을 신청하세요.
- **개인 키 모드**: 공용 한도가 부족하면, 사용자가 각자 발급한 키를 요청 헤더 `X-Data-Go-Kr-Key` / `X-Law-Oc`로 보내게 할 수 있습니다 (서버 env 키보다 우선 적용).

## 4. 처음 켠 뒤 확인할 것 (중요)

특정소방대상물 2개 API의 **오퍼레이션명**은 활용신청 후 받는 활용가이드 문서로 확정해야 합니다.
`search_fire_building` 호출이 404를 반환하면, 가이드 문서의 오퍼레이션명을 확인해
환경변수 `FIRE_BUILDING_OP` / `FIRE_FACILITY_OP`로 지정하세요 (코드 수정 불필요).
