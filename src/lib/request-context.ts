/**
 * HTTP 모드 요청별 인증키 격리 (AsyncLocalStorage)
 * 동시 요청이 서로 다른 헤더 키를 써도 섞이지 않는다.
 * 키 우선순위: 요청 헤더 > 서버 환경변수
 */

import { AsyncLocalStorage } from "node:async_hooks"

export interface RequestKeys {
  dataGoKrKey?: string
  lawOc?: string
}

export const requestContext = new AsyncLocalStorage<RequestKeys>()
