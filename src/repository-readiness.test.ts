import { readFileSync, existsSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { allTools } from "./tool-registry.js"
import { VERSION } from "./version.js"

const root = resolve(import.meta.dirname, "..")
const read = (name: string) => readFileSync(resolve(root, name), "utf8")

describe("공공기관 제출용 저장소 일관성", () => {
  it("실행 버전·패키지 버전·현재 문서 버전이 일치한다", () => {
    const pkg = JSON.parse(read("package.json"))
    expect(pkg.version).toBe(VERSION)
    for (const name of ["README.md", "DEPLOY.md", "ARCHITECTURE.md", "인수인계.md"])
      expect(read(name)).toContain(`v${VERSION}`)
  })

  it("지원 중인 Node LTS를 요구하고 Docker도 LTS를 쓴다", () => {
    const pkg = JSON.parse(read("package.json"))
    expect(pkg.engines.node).toBe(">=22")
    expect(read("Dockerfile")).toMatch(/^FROM node:24-slim/m)
  })

  it("README가 기관 서버형과 PC 설치형을 각각 독립 문서로 안내한다", () => {
    const readme = read("README.md")
    expect(readme).toContain("기관 서버형")
    expect(readme).toContain("개별 PC 설치형")
    expect(readme).toContain("[DEPLOY.md](DEPLOY.md)")
    expect(readme).toContain("[LOCAL_SETUP.md](LOCAL_SETUP.md)")
  })

  it("사용자 문서에 종료·오해 소지가 큰 안내가 남지 않는다", () => {
    const currentDocs = ["README.md", "DEPLOY.md", "ARCHITECTURE.md", "인수인계.md"]
      .map(read)
      .join("\n")
    for (const stale of ["Node.js 18", "gpt-4o-mini", "gemini-2.5-flash", "fly.io", "월 몇만 원", "무료~월 몇천 원"])
      expect(currentDocs).not.toContain(stale)
  })

  it("README에는 등록된 도구가 빠짐없이 있다", () => {
    const readme = read("README.md")
    for (const tool of allTools) expect(readme).toContain(`\`${tool.name}\``)
  })

  it("실제 MIT 라이선스·보안정책·로컬 설치 문서가 저장소에 존재한다", () => {
    expect(existsSync(resolve(root, "LICENSE"))).toBe(true)
    expect(existsSync(resolve(root, "SECURITY.md"))).toBe(true)
    expect(existsSync(resolve(root, "LOCAL_SETUP.md"))).toBe(true)
  })

  it("CI가 지원 Node 두 버전에서 깨끗한 설치·검증·전체 의존성 감사를 수행한다", () => {
    const ci = read(".github/workflows/ci.yml")
    expect(ci).toContain("node: [22, 24]")
    expect(ci).toContain("run: npm ci")
    expect(ci).toContain("run: npm run verify")
    expect(ci).toContain("run: npm audit")
    for (const line of ci.match(/^\s*- uses: .+$/gm) ?? []) expect(line).toMatch(/@[0-9a-f]{40}/)
  })

  it("구현 파일은 단일 책임을 유지하도록 200줄을 넘지 않는다", () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = resolve(dir, entry.name)
      return entry.isDirectory() ? walk(path) : path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : []
    })
    for (const file of walk(resolve(root, "src"))) {
      const lines = readFileSync(file, "utf8").split("\n").length
      expect(lines, file).toBeLessThanOrEqual(200)
    }
  })
})
