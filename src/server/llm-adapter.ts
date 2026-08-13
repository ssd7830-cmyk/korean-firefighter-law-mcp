/**
 * LLM 어댑터 — 받는 쪽이 키만 꽂으면 아무 LLM이나 붙는 구조
 *
 * 선택: LLM_PROVIDER=gemini|claude|openai|claude-cli|codex-cli (미지정 시 키가 있는 provider 자동 감지)
 * 키:   GEMINI_API_KEY | ANTHROPIC_API_KEY | OPENAI_API_KEY
 *       claude-cli/codex-cli는 API 키 없이 로컬에 설치·로그인된 CLI 계정을 사용한다.
 * 모델: LLM_MODEL (미지정 시 provider별 기본값)
 * 아무것도 지정하지 않으면 null → 챗봇은 "조회 모드"로 동작 (조회 결과 원문 표시)
 */

import Anthropic from "@anthropic-ai/sdk"
import { claudeCliAdapter, codexCliAdapter } from "./cli-llm-adapter.js"

export interface LlmAdapter {
  name: string
  model?: string
  generate(system: string, user: string): Promise<string>
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
      if (!res.ok) throw new Error(`Gemini API 오류 (HTTP ${res.status})`)
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
      const res = await client.messages.create({
        model,
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: user }],
      })
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
      if (!res.ok) throw new Error(`OpenAI API 오류 (HTTP ${res.status})`)
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
