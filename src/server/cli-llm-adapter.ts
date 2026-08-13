import { spawn } from "node:child_process"
import { tmpdir } from "node:os"
import type { LlmAdapter } from "./llm-adapter.js"

let active = 0
const waiters: Array<() => void> = []

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

async function withSlot<T>(work: () => Promise<T>): Promise<T> {
  const max = positiveInt(process.env.LLM_MAX_CONCURRENCY, 2)
  const maxQueue = positiveInt(process.env.LLM_MAX_QUEUE, 20)
  if (active >= max) {
    if (waiters.length >= maxQueue) throw new Error("LLM 요청 대기열이 가득 찼습니다. 잠시 후 다시 시도하세요.")
    await new Promise<void>((resolve) => waiters.push(resolve))
  }
  active++
  try {
    return await work()
  } finally {
    active--
    waiters.shift()?.()
  }
}

export function safeCliEnvironment(): NodeJS.ProcessEnv {
  const names = [
    "PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TERM", "USER", "LOGNAME", "SHELL", "SSH_AUTH_SOCK",
    "CODEX_HOME", "CLAUDE_CONFIG_DIR", "__CF_USER_TEXT_ENCODING", "XPC_FLAGS", "XPC_SERVICE_NAME",
    "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY",
  ]
  return Object.fromEntries(names.flatMap((name) => process.env[name] ? [[name, process.env[name]]] : []))
}

function runCli(bin: string, args: string[], input: string, label: string): Promise<string> {
  return withSlot(() => new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: tmpdir(), env: safeCliEnvironment(), stdio: ["pipe", "pipe", "pipe"] })
    const maxBytes = 4 * 1024 * 1024
    let stdout = ""
    let stderr = ""
    let overflow = false
    const timer = setTimeout(() => child.kill("SIGKILL"), positiveInt(process.env.LLM_TIMEOUT_MS, 120_000))
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length + chunk.length > maxBytes) overflow = true
      else stdout += chunk
    })
    child.stderr.on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-4000) })
    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      const hint = err.code === "ENOENT" ? `${label} CLI를 찾지 못했습니다. 설치 여부와 CLI_PATH 설정을 확인하세요.` : err.message
      reject(new Error(`${label} CLI 호출 실패: ${hint}`))
    })
    child.on("close", (code, signal) => {
      clearTimeout(timer)
      if (overflow) return reject(new Error(`${label} CLI 응답이 허용 크기를 초과했습니다.`))
      if (code !== 0) return reject(new Error(`${label} CLI 호출 실패 (${signal ?? `exit ${code}`}): ${stderr.trim().slice(0, 500)}`))
      const output = stdout.trim()
      if (!output) return reject(new Error(`${label} CLI가 빈 응답을 반환했습니다.`))
      resolve(output)
    })
    child.stdin.end(input)
  }))
}

function codexAnswer(jsonl: string): string {
  let answer = ""
  for (const line of jsonl.split("\n")) {
    try {
      const event = JSON.parse(line)
      if (event?.type === "item.completed" && event?.item?.type === "agent_message") answer = event.item.text ?? answer
    } catch { /* JSONL 이외의 진단 줄은 무시 */ }
  }
  if (!answer.trim()) throw new Error("Codex CLI 최종 답변을 해석하지 못했습니다.")
  return answer.trim()
}

export function claudeCliAdapter(): LlmAdapter {
  const model = process.env.LLM_MODEL || "claude-sonnet-5"
  const bin = process.env.CLAUDE_CLI_PATH || "claude"
  return {
    name: "claude-cli", model,
    generate: (system, user) => runCli(bin, [
      "-p", "--model", model, "--system-prompt", system, "--tools", "", "--no-session-persistence",
      "--safe-mode", "--disable-slash-commands", "--no-chrome", "--output-format", "text",
    ], user, "Claude Code"),
  }
}

export function codexCliAdapter(): LlmAdapter {
  const model = process.env.LLM_MODEL || "gpt-5.6-sol"
  const bin = process.env.CODEX_CLI_PATH || "codex"
  return {
    name: "codex-cli", model,
    async generate(system, user) {
      const output = await runCli(bin, [
        "exec", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--sandbox", "read-only",
        "--skip-git-repo-check", "--color", "never", "--json", "--model", model, "-",
      ], `${system}\n\n[사용자 입력]\n${user}`, "Codex")
      return codexAnswer(output)
    },
  }
}
