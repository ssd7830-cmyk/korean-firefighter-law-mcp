/**
 * 법제처 국가법령정보 API 클라이언트 (소방 도메인용 최소 구현)
 * 인증: OC 키 URL 파라미터 (로그인·세션 없음)
 */

import { fetchWithRetry } from "./fetch-with-retry.js"
import { parseXml } from "./xml.js"
import { requestContext } from "./request-context.js"
import type { CacheStore } from "./cache.js"

// DRF는 정상 파라미터에도 버스트 호출 시 간헐 404를 낸다 → 404 재시도 포함
const DRF_RETRY = { retryOn: [404, 429, 503, 504] }

function baseUrl(): string {
  const protocol = process.env.LAW_API_PROTOCOL === "http" ? "http" : "https"
  return `${protocol}://www.law.go.kr/DRF`
}

export class LawApiClient {
  constructor(private cache: CacheStore) {}

  private oc(): string {
    // 요청 헤더 키(HTTP 모드) 우선, 없으면 서버 환경변수
    const key = requestContext.getStore()?.lawOc || process.env.LAW_OC
    if (!key) {
      throw new Error(
        "LAW_OC가 필요합니다. 법제처(https://open.law.go.kr)에서 OPEN API 인증키를 발급받으세요. " +
          "(HTTP 모드에서는 X-Law-Oc 헤더로도 전달 가능)"
      )
    }
    return key
  }

  /** lawSearch.do — target: law(법령) | prec(판례) | admrul(행정규칙) */
  async search(target: string, query: string, extra: Record<string, string> = {}): Promise<any> {
    return this.fetch("lawSearch.do", { target, query, ...extra })
  }

  /** lawService.do — 본문 조회 (MST 기반) */
  async service(target: string, params: Record<string, string>): Promise<any> {
    return this.fetch("lawService.do", { target, ...params })
  }

  private async fetch(endpoint: string, params: Record<string, string>): Promise<any> {
    const qs = new URLSearchParams({ OC: this.oc(), type: "XML", ...params })
    const cacheKey = `${endpoint}?${new URLSearchParams({ type: "XML", ...params }).toString()}`
    const ttl = endpoint === "lawService.do" ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000

    const cached = this.cache.get<any>(cacheKey)
    if (cached) return cached

    const url = `${baseUrl()}/${endpoint}?${qs.toString()}`
    const response = await fetchWithRetry(url, DRF_RETRY)
    if (!response.ok) throw new Error(`법제처 API 오류 (HTTP ${response.status}): ${endpoint}`)

    const text = await response.text()
    if (!text.trim()) {
      throw new Error("법제처 API가 빈 응답을 반환했습니다. 일시 장애일 수 있으니 잠시 후 다시 시도하세요.")
    }
    if (text.includes("<!DOCTYPE html") || text.includes("<html")) {
      throw new Error(
        "법제처 API가 HTML 페이지를 반환했습니다. OC 키 유효성과 파라미터를 확인하세요. " +
          "(키가 유효한데도 실패하면 open.law.go.kr에서 신청 도메인/IP 등록을 확인)"
      )
    }

    const parsed = parseXml(text)
    this.cache.set(cacheKey, parsed, ttl)
    return parsed
  }
}
