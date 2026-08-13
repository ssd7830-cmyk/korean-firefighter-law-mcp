import { maskSensitiveUrl } from "./fetch-with-retry.js"

export interface ToolResult {
  [key: string]: unknown // MCP SDK CallToolResult 호환
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] }
}

export function formatToolError(toolName: string, err: unknown): ToolResult {
  const msg = err instanceof Error ? err.message : String(err)
  return {
    content: [{ type: "text", text: `[${toolName}] 오류: ${maskSensitiveUrl(msg)}` }],
    isError: true,
  }
}
