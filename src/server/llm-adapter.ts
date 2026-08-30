/**
 * LLM 어댑터 — 받는 쪽이 키만 꽂으면 아무 LLM이나 붙는 구조
 *
 * 선택: LLM_PROVIDER=gemini|claude|openai|claude-cli|codex-cli (미지정 시 키가 있는 provider 자동 감지)
 * 키:   GEMINI_API_KEY | ANTHROPIC_API_KEY | OPENAI_API_KEY
 *       claude-cli/codex-cli는 API 키 없이 로컬에 설치·로그인된 CLI 계정을 사용한다.
 * 모델: LLM_MODEL (미지정 시 provider별 기본값)
 * 아무것도 지정하지 않으면 null → HTTP 챗봇 비활성(503). /mcp와 stdio는 LLM 없이 동작한다.
 */

import Anthropic from "@anthropic-ai/sdk"
import { claudeCliAdapter, codexCliAdapter } from "./cli-llm-adapter.js"

export interface LlmAdapter {
  name: string
  model?: string
  generate(system: string, user: string): Promise<string>
}

/** 공급자 오류 본문에서 원인 문구만 뽑는다. 키가 되비쳐 나올 수 있으므로 마스킹하고 길이를 제한한다. */
function providerErrorDetail(body: string): string {
  let detail = body.trim()
  try {
    const json: any = JSON.parse(detail)
    detail = String(json?.error?.message ?? json?.error?.status ?? json?.message ?? detail)
  } catch {
    // JSON이 아니면 원문 앞부분을 그대로 쓴다
  }
  detail = detail.replace(/\b(sk-[A-Za-z0-9_\-]{8,}|AIza[A-Za-z0-9_\-]{8,})/g, "***")
  return detail.length > 300 ? `${detail.slice(0, 300)}…` : detail
}

/** 상태코드를 기관 담당자가 바로 조치할 수 있는 한국어 안내로 바꾼다. */
function providerErrorHint(status: number, provider: string, keyEnv: string): string {
  switch (status) {
    case 401:
    case 403:
      return `${keyEnv} 값이 잘못되었거나 권한이 없습니다. 키를 다시 확인하고, 해당 계정에 ${provider} API 사용 권한과 결제 수단이 등록되어 있는지 확인하세요.`
    case 404:
      return `요청한 모델을 찾을 수 없습니다. LLM_MODEL 환경변수로 계정에서 사용 가능한 모델 이름을 지정하세요.`
    case 429:
      return `요청 한도를 초과했습니다. 잠시 후 다시 시도하거나 ${provider} 계정의 사용 한도를 확인하세요.`
    default:
      return status >= 500
        ? `${provider} 서버 오류입니다. 잠시 후 다시 시도하세요.`
        : `${provider} 요청이 거부되었습니다.`
  }
}

async function providerError(res: Response, provider: string, keyEnv: string): Promise<Error> {
  const body = await res.text().catch(() => "")
  const hint = providerErrorHint(res.status, provider, keyEnv)
  const detail = providerErrorDetail(body)
  return new Error(`${provider} API 오류 (HTTP ${res.status}). ${hint}${detail ? ` — 공급자 응답: ${detail}` : ""}`)
}

function llmTimeoutMs(): number {
  const configured = Number(process.env.LLM_TIMEOUT_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : 30_000
}

function geminiAdapter(): LlmAdapter {
  const model = process.env.LLM_MODEL || "gemini-3.6-flash"
  return {
    name: "gemini",
    model,
    async generate(system, user) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          signal: AbortSignal.timeout(llmTimeoutMs()),
          headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
          }),
        }
      )
      if (!res.ok) throw await providerError(res, "Gemini", "GEMINI_API_KEY")
      const json: any = await res.json()
      const text = (json?.candidates?.[0]?.content?.parts ?? [])
        .map((p: any) => p.text ?? "")
        .join("")
      if (!text) throw new Error("Gemini가 빈 응답을 반환했습니다.")
      return text
    },
  }
}

function claudeAdapter(): LlmAdapter {
  const model = process.env.LLM_MODEL || "claude-sonnet-5"
  const client = new Anthropic({ timeout: llmTimeoutMs() })
  return {
    name: "claude",
    model,
    async generate(system, user) {
      let res: Anthropic.Message
      try {
        res = await client.messages.create({
          model,
          max_tokens: 8192,
          system,
          messages: [{ role: "user", content: user }],
        })
      } catch (err) {
        if (err instanceof Anthropic.APIError && typeof err.status === "number") {
          const hint = providerErrorHint(err.status, "Claude", "ANTHROPIC_API_KEY")
          const detail = providerErrorDetail(err.message ?? "")
          throw new Error(
            `Claude API 오류 (HTTP ${err.status}). ${hint}${detail ? ` — 공급자 응답: ${detail}` : ""}`
          )
        }
        throw err
      }
      if (res.stop_reason === "refusal") return "안전상의 이유로 이 질문에는 답변이 제한되었습니다."
      const text = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
      if (!text) throw new Error("Claude가 빈 응답을 반환했습니다.")
      return text
    },
  }
}

function openaiAdapter(): LlmAdapter {
  const model = process.env.LLM_MODEL || "gpt-5.6-luna"
  return {
    name: "openai",
    model,
    async generate(system, user) {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(llmTimeoutMs()),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          instructions: system,
          input: user,
        }),
      })
      if (!res.ok) throw await providerError(res, "OpenAI", "OPENAI_API_KEY")
      const json: any = await res.json()
      const text = (json?.output ?? [])
        .flatMap((item: any) => item?.content ?? [])
        .filter((item: any) => item?.type === "output_text")
        .map((item: any) => item.text ?? "")
        .join("")
      if (!text) throw new Error("OpenAI가 빈 응답을 반환했습니다.")
      return text
    },
  }
}

export function createLlmAdapter(): LlmAdapter | null {
  const provider =
    process.env.LLM_PROVIDER ||
    (process.env.GEMINI_API_KEY
      ? "gemini"
      : process.env.ANTHROPIC_API_KEY
        ? "claude"
        : process.env.OPENAI_API_KEY
          ? "openai"
          : "")
  switch (provider) {
    case "gemini":
      if (!process.env.GEMINI_API_KEY) throw new Error("LLM_PROVIDER=gemini에는 GEMINI_API_KEY가 필요합니다.")
      return geminiAdapter()
    case "claude":
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("LLM_PROVIDER=claude에는 ANTHROPIC_API_KEY가 필요합니다.")
      return claudeAdapter()
    case "openai":
      if (!process.env.OPENAI_API_KEY) throw new Error("LLM_PROVIDER=openai에는 OPENAI_API_KEY가 필요합니다.")
      return openaiAdapter()
    case "claude-cli":
      return claudeCliAdapter() // API 키 없이 로컬 Claude Code 구독 사용
    case "codex-cli":
      return codexCliAdapter() // API 키 없이 로컬 Codex 로그인 사용
    case "":
      return null // 조회 모드
    default:
      throw new Error("LLM_PROVIDER는 gemini, claude, openai, claude-cli, codex-cli 중 하나여야 합니다.")
  }
}
