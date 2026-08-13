import type { IncomingMessage } from "node:http"
import { StringDecoder } from "node:string_decoder"
import type { ChatMessage } from "./chat-pipeline.js"

export class PayloadTooLargeError extends Error {}

export function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""
    let size = 0
    const decoder = new StringDecoder("utf8")
    const cleanup = () => {
      req.off("data", onData); req.off("end", onEnd); req.off("error", onError)
    }
    const onData = (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        cleanup(); req.resume(); reject(new PayloadTooLargeError("body too large")); return
      }
      data += decoder.write(chunk)
    }
    const onEnd = () => { cleanup(); resolve(data + decoder.end()) }
    const onError = (err: Error) => { cleanup(); reject(err) }
    const contentLength = Number(req.headers["content-length"])
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      req.resume(); reject(new PayloadTooLargeError("body too large")); return
    }
    req.on("data", onData); req.on("end", onEnd); req.on("error", onError)
  })
}

export function headerValue(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

export function parseHistory(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is { role: string; text: string } =>
      !!item && typeof item === "object" && typeof item.role === "string" && typeof item.text === "string")
    .filter((item) => item.role === "user" || item.role === "assistant" || item.role === "bot")
    .slice(-8)
    .map((item) => ({ role: item.role === "user" ? "user" : "assistant", text: item.text.slice(0, 4000) }))
}
