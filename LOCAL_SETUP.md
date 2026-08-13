# 개별 PC 설치 안내

> 적용 버전: v0.6.0 / 대상: 기관이 허용한 **stdio 방식 MCP 클라이언트**

이 방식은 각 PC에서 프로그램을 실행하고 해당 PC의 AI 클라이언트가 MCP로 호출합니다. 별도 중앙 서버와
LLM API 키는 필요 없지만, 공공데이터포털 키와 법제처 OC는 각 PC에 설정해야 합니다.

현재 확인한 구성 대상은 [Claude Desktop의 로컬 MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop)처럼
stdio를 지원하는 클라이언트입니다. [ChatGPT의 커스텀 MCP 앱](https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt-beta)은
로컬 서버에 직접 연결하지 않으므로 ChatGPT를 쓸 때는 [기관 서버형 배포](DEPLOY.md)를 사용해야 합니다.

## 1. 설치 전 결정

- 기관 정보보호 담당자가 로컬 MCP 실행과 외부 정부 API 통신을 허용했는지 확인합니다.
- `DATA_GO_KR_KEY`, `LAW_OC`의 발급·배포·회수 책임자를 정합니다.
- 설정 파일에는 키가 평문으로 들어가므로 공용·개인 소유 PC에는 설치하지 말고 기관 관리 PC만 사용합니다.
- Node.js는 지원 중인 LTS인 22 또는 24를 설치합니다. 새 설치에는 24 LTS를 권장합니다.

## 2. 프로그램 설치

### Windows PowerShell

```powershell
git clone https://github.com/ssd7830-cmyk/korean-firefighter-law-mcp.git
Set-Location korean-firefighter-law-mcp
npm ci
npm run build
(Resolve-Path .\build\index.js).Path
(Get-Command node).Source
```

마지막 두 명령이 출력한 `build\index.js`와 `node.exe`의 절대경로를 복사합니다.

### macOS/Linux

```bash
git clone https://github.com/ssd7830-cmyk/korean-firefighter-law-mcp.git
cd korean-firefighter-law-mcp
npm ci
npm run build
printf '%s/build/index.js\n' "$PWD"
command -v node
```

마지막 두 명령이 출력한 절대경로를 복사합니다.

## 3. AI 클라이언트 연결

Claude Desktop의 설정에서 개발자 설정 또는 로컬 MCP 설정 파일 편집 메뉴를 엽니다. 기존 JSON이 있다면
전체를 덮어쓰지 말고 `mcpServers` 안에 아래 항목만 합칩니다.

```json
{
  "mcpServers": {
    "firefighter-law": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": ["C:/기관관리경로/korean-firefighter-law-mcp/build/index.js"],
      "env": {
        "DATA_GO_KR_KEY": "발급받은 키",
        "LAW_OC": "발급받은 OC"
      }
    }
  }
}
```

- Windows도 JSON 경로에는 `/`를 쓰면 역슬래시 이스케이프 문제를 피할 수 있습니다.
- macOS/Linux에서는 `command`와 `args`를 2장에서 확인한 절대경로로 바꿉니다.
- 다른 stdio 지원 클라이언트도 `command`, `args`, `env` 세 값을 같은 방식으로 등록합니다.
- 저장 후 AI 클라이언트를 완전히 종료했다가 다시 실행합니다.

## 4. 설치 검증

1. 클라이언트의 연결/도구 화면에서 `firefighter-law`와 도구 11개가 보이는지 확인합니다.
2. `소방시설법 제10조`를 물어 법제처 조회를 확인합니다.
3. `2025년 1월 1일 화재 현황`을 물어 소방청 통계를 확인합니다.
4. `아세톤 위험물이야?`를 물어 위험물 조회를 확인합니다.

자동 테스트도 함께 실행합니다.

```bash
npm run verify
```

실제 API 결과는 계정 승인 상태와 원천 데이터에 좌우되므로 자동 테스트 통과만으로 실연동 성공을 대신할
수 없습니다. 위 3개 실질문을 배포 직전 각 표준 PC 이미지에서 확인합니다.

## 5. 업데이트와 제거

업데이트:

```bash
git pull --ff-only
npm ci
npm run build
```

그 뒤 AI 클라이언트를 재시작하고 4장의 검증을 반복합니다. 기관 전체 배포라면 먼저 시험 PC에서 검증한 뒤
동일 커밋을 배포합니다.

제거하려면 AI 클라이언트 설정의 `firefighter-law` 항목을 삭제하고 클라이언트를 재시작합니다. 그 다음
프로그램 폴더를 기관의 소프트웨어 제거 절차에 따라 삭제하고, 더 이상 쓰지 않는 API 키는 발급처에서
폐기하거나 재발급합니다.

## 지원 범위

- 로컬 방식은 중앙 웹 채팅 화면(`/`)과 `/api/chat`을 사용하지 않습니다. AI 답변은 연결한 클라이언트가 만듭니다.
- 구급통계 도구는 현재 교통사고 구급활동 범위만 제공합니다.
- 이 저장소는 아직 원클릭 `.mcpb` 설치 파일을 배포하지 않습니다. 수동 JSON 설치가 불가능한 기관은
  표준 PC 이미지나 소프트웨어 배포 도구로 위 구성을 배포하거나, 별도 검토를 거쳐 서명된 데스크톱 확장으로
  패키징해야 합니다.
