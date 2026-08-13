import { afterEach, describe, expect, it } from "vitest"
import { safeCliEnvironment } from "./cli-llm-adapter.js"

describe("로컬 CLI LLM 격리", () => {
  afterEach(() => {
    delete process.env.DATA_GO_KR_KEY
    delete process.env.LAW_OC
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
  })

  it("자식 프로세스에 정부·LLM API 비밀값을 상속하지 않는다", () => {
    process.env.DATA_GO_KR_KEY = "fire-secret"
    process.env.LAW_OC = "law-secret"
    process.env.OPENAI_API_KEY = "openai-secret"
    process.env.ANTHROPIC_API_KEY = "claude-secret"
    const env = safeCliEnvironment()
    expect(env.DATA_GO_KR_KEY).toBeUndefined()
    expect(env.LAW_OC).toBeUndefined()
    expect(env.OPENAI_API_KEY).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.PATH).toBe(process.env.PATH)
  })
})
