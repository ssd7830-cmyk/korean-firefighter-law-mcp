/**
 * CacheStore 인터페이스 + 인메모리 LRU 구현.
 * data.go.kr 일일 호출 한도(1천~1만/일)가 실측으로 문제 되면
 * 이 인터페이스의 SQLite 구현체로 교체한다 — 도구 코드는 수정 불필요.
 */

export interface CacheStore {
  get<T>(key: string): T | undefined
  set<T>(key: string, data: T, ttlMs: number): void
}

interface Entry {
  data: unknown
  expiresAt: number
}

export class InMemoryLruCache implements CacheStore {
  private map = new Map<string, Entry>()

  constructor(private maxSize: number = 100) {}

  get<T>(key: string): T | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return undefined
    }
    // LRU: 조회 시 최신으로 이동
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.data as T
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    if (this.map.size >= this.maxSize && !this.map.has(key)) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.delete(key)
    this.map.set(key, { data, expiresAt: Date.now() + ttlMs })
  }
}

export const TTL = {
  SEARCH: 60 * 60 * 1000, // 검색 1시간
  ARTICLE: 24 * 60 * 60 * 1000, // 조문·시설정보 24시간
  CLOSED_STATS: 7 * 24 * 60 * 60 * 1000, // 확정된 과거 통계 7일
} as const

/**
 * 조회 기간(YYYYMM 또는 YYYYMMDD)이 지난달 이전이면 확정 통계로 보고 길게 캐시.
 * 이번 달·기간 미지정은 아직 갱신될 수 있으므로 짧게.
 */
export function statsTtlFor(period?: string): number {
  if (!period) return TTL.SEARCH
  const now = new Date()
  const currentMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`
  return period.slice(0, 6) < currentMonth ? TTL.CLOSED_STATS : TTL.SEARCH
}
