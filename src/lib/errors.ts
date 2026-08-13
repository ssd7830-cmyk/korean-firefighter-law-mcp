import { maskSensitiveUrl } from "./fetch-with-retry.js"

export interface ToolResult {
  [key: string]: unknown // MCP SDK CallToolResult 호환
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] }
}

/** 조회 성공이지만 결과가 없는 경우. 챗 파이프라인이 이를 근거로 LLM 답변을 만들지 않게 한다. */
export function emptyResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true }
}

export function formatToolError(toolName: string, err: unknown): ToolResult {
  const msg = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: "text", text: `[${toolName}] 오류: ${maskSensitiveUrl(msg)}` }],
    isError: true,
  }
}
