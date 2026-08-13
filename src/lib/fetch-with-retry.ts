/**
 * 네트워크 방어층: 타임아웃 + 재시도(지수 백오프) + 인증키 마스킹
 * 법제처 DRF는 정상 파라미터에도 버스트 호출 시 간헐 404를 내므로 404도 재시도 대상.
 */

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_RETRIES = 3

export interface RetryOptions {
  retryOn?: number[]
  timeoutMs?: number
}

/** 로그·에러 메시지에서 인증키 노출 방지 */
export function maskSensitiveUrl(url: string): string {
  return url.replace(/(serviceKey|ServiceKey|OC)=[^&]*/g, "$1=***")
}

function buildHeaders(url: string): Record<string, string> {
  // 법제처는 Referer 없는 요청을 키 유효 여부와 무관하게 거부한다
  if (url.includes("law.go.kr")) {
    return { Referer: process.env.LAW_REFERER || "https://www.law.go.kr/" }
  }
  return {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function fetchWithRetry(url: string, opts: RetryOptions = {}): Promise<Response> {
  const retryOn = opts.retryOn ?? [429, 503, 504]
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1))
    let response: Response
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: buildHeaders(url),
      })
    } catch {
      if (attempt === MAX_RETRIES) break
      continue
    }
    if (retryOn.includes(response.status) && attempt < MAX_RETRIES) {
      await response.text().catch(() => {})
      continue
    }
    return response
  }
  throw new Error(`네트워크 요청 실패 (재시도 ${MAX_RETRIES}회 소진): ${maskSensitiveUrl(url)}`)
}
