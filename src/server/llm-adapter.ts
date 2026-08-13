/**
 * LLM 어댑터 — 받는 쪽이 키만 꽂으면 아무 LLM이나 붙는 구조
 *
 * 선택: LLM_PROVIDER=gemini|claude|openai (미지정 시 키가 있는 provider 자동 감지)
 * 키:   GEMINI_API_KEY | ANTHROPIC_API_KEY | OPENAI_API_KEY
 * 모델: LLM_MODEL (미지정 시 provider별 기본값)
 * 키가 하나도 없으면 null → 챗봇은 "조회 모드"로 동작 (조회 결과 원문 표시)
 */

import Anthropic from "@anthropic-ai/sdk"

export interface LlmAdapter {
  name: string
  generate(system: string, user: string): Promise<string>
}

function geminiAdapter(): LlmAdapter {
  const model = process.env.LLM_MODEL || "gemini-2.5-flash"
  return {
    name: "gemini",
    async generate(system, user) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
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
  const model = process.env.LLM_MODEL || "claude-opus-5"
  const client = new Anthropic()
  return {
    name: "claude",
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
  const model = process.env.LLM_MODEL || "gpt-4o-mini"
  return {
    name: "openai",
    async generate(system, user) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      })
      if (!res.ok) throw new Error(`OpenAI API 오류 (HTTP ${res.status})`)
      const json: any = await res.json()
      const text = json?.choices?.[0]?.message?.content
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
      return geminiAdapter()
    case "claude":
      return claudeAdapter()
    case "openai":
      return openaiAdapter()
    default:
      return null // 조회 모드
  }
}
