/**
 * 공공데이터포털(apis.data.go.kr) 소방청 API 클라이언트
 * 인증: serviceKey URL 파라미터 (로그인·세션 없음)
 */

import { fetchWithRetry } from "./fetch-with-retry.js"
import { parseXml } from "./xml.js"
import { requestContext } from "./request-context.js"
import type { CacheStore } from "./cache.js"

const BASE = "https://apis.data.go.kr/1661000"

export interface DataGoKrBody {
  items?: { item?: unknown }
  totalCount?: number | string
}

export class FireApiClient {
  constructor(private cache: CacheStore) {}

  private serviceKey(): string {
    // 요청 헤더 키(HTTP 모드) 우선, 없으면 서버 환경변수
    const key = requestContext.getStore()?.dataGoKrKey || process.env.DATA_GO_KR_KEY
    if (!key) {
      throw new Error(
        "DATA_GO_KR_KEY가 필요합니다. 공공데이터포털(https://www.data.go.kr)에서 소방청 API 활용신청 후 발급받으세요. " +
          "(HTTP 모드에서는 X-Data-Go-Kr-Key 헤더로도 전달 가능)"
      )
    }
    // 인코딩 키(% 포함)는 그대로, 디코딩 키는 인코딩해서 사용
    return key.includes("%") ? key : encodeURIComponent(key)
  }

  async call(
    service: string,
    operation: string,
    params: Record<string, string | number | undefined>,
    ttlMs: number
  ): Promise<DataGoKrBody> {
    const qs = new URLSearchParams({ resultType: "json" })
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") qs.append(k, String(v))
    }

    const cacheKey = `${service}/${operation}?${qs.toString()}`
    const cached = this.cache.get<DataGoKrBody>(cacheKey)
    if (cached) return cached

    // resultType=xml 강제 — json 모드는 일부 서비스가 빈 결과를 반환한다 (2026-08-13 실측).
    // 단 위험물(materialInfoSvc)처럼 xml을 요청해도 JSON으로 답하는 서비스가 있어 아래에서 둘 다 파싱한다.
    qs.set("resultType", "xml")
    const url = `${BASE}/${service}/${operation}?serviceKey=${this.serviceKey()}&${qs.toString()}`
    const response = await fetchWithRetry(url, { retryOn: [429, 500, 503, 504] })
    const text = await response.text()

    // 인증·한도 오류는 resultType=json이어도 XML(OpenAPI_ServiceResponse)로 온다
    if (text.trimStart().startsWith("<")) {
      const parsed = parseXml(text)
      const header = parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader
      if (header) {
        throw new Error(
          `공공데이터포털 오류: ${header.returnAuthMsg || header.errMsg} (코드 ${header.returnReasonCode}). ` +
            `키 미등록/미승인이면 data.go.kr에서 해당 API 활용신청 상태를 확인하세요.`
        )
      }
      const resp = parsed?.response
      if (resp?.body) return this.checkAndCache(resp, cacheKey, ttlMs)
      throw new Error(`API가 해석 불가능한 XML을 반환했습니다: ${operation}`)
    }

    if (!response.ok) throw new Error(`API 오류 (HTTP ${response.status}): ${operation}`)
    if (!text.trim()) throw new Error(`API가 빈 응답을 반환했습니다: ${operation}. 잠시 후 다시 시도하세요.`)

    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`API가 해석할 수 없는 응답을 반환했습니다: ${operation}. 일시 장애일 수 있으니 잠시 후 다시 시도하세요.`)
    }
    // 위험물 등 일부 서비스는 response 래퍼 없이 {header, body}를 바로 반환한다
    return this.checkAndCache(json?.response ?? json, cacheKey, ttlMs)
  }

  private checkAndCache(resp: any, cacheKey: string, ttlMs: number): DataGoKrBody {
    const code = resp?.header?.resultCode
    if (code !== undefined && code !== "00" && code !== "0" && code !== 0) {
      throw new Error(`API 오류 ${code}: ${resp?.header?.resultMsg || "원인 미상"}`)
    }
    let body: DataGoKrBody = resp?.body ?? {}
    // 일부 서비스는 items가 {item:[...]} 대신 배열로, 상세 조회는 body.item 단수로 온다 — 도구가 보는 형태로 통일
    if (Array.isArray((body as any).items)) body = { ...body, items: { item: (body as any).items } }
    else if (!(body as any).items && (body as any).item) body = { ...body, items: { item: (body as any).item } }
    // 빈 결과는 캐시하지 않는다 — 원천 데이터 입력 지연 중의 빈 응답이 박제되면
    // TTL 동안 계속 "결과 없음"으로 오답을 주게 된다
    const items = body.items?.item
    const hasItems = Array.isArray(items) ? items.length > 0 : items !== undefined && items !== null
    if (hasItems) this.cache.set(cacheKey, body, ttlMs)
    return body
  }
}
