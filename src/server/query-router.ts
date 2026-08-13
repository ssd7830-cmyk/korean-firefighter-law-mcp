/**
 * 질문 → 조회 도구 라우팅 (키워드 기반, AI 판단 개입 없음 — 조회를 코드로 강제)
 */

import { FIRE_LAWS, FIRE_LAW_ALIASES } from "../lib/search-normalizer.js"

export interface RoutedQuery {
  tool: string
  args: Record<string, unknown>
}

const SIDO: Record<string, string> = {
  서울: "서울특별시", 부산: "부산광역시", 대구: "대구광역시", 인천: "인천광역시",
  광주: "광주광역시", 대전: "대전광역시", 울산: "울산광역시", 세종: "세종특별자치시",
  경기: "경기도", 강원: "강원특별자치도", 충북: "충청북도", 충남: "충청남도",
  전북: "전북특별자치도", 전남: "전라남도", 경북: "경상북도", 경남: "경상남도",
  제주: "제주특별자치도",
}

function extractSido(q: string): string | undefined {
  for (const [short, full] of Object.entries(SIDO)) {
    if (q.includes(short)) return full
  }
  return undefined
}

/** "2025년 1월 3일" | "2025-01-03" | "20250103" | 어제/오늘 → YYYYMMDD */
export function extractDate(q: string): string | undefined {
  const m8 = q.match(/\b(\d{8})\b/)
  if (m8) return m8[1]
  const m = q.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/)
  if (m) return `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`
  const rel = /어제/.test(q) ? -1 : /오늘/.test(q) ? 0 : undefined
  if (rel !== undefined) {
    const d = new Date(Date.now() + rel * 24 * 60 * 60 * 1000)
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  }
  return undefined
}

function extractJo(q: string): string | undefined {
  const m = q.replace(/\s+/g, "").match(/제(\d+)조(?:의(\d+))?/)
  if (!m) return undefined
  return m[2] ? `${m[1]}의${m[2]}` : m[1]
}

function extractLawName(q: string): string | undefined {
  const compact = q.replace(/\s+/g, "")
  for (const name of [...FIRE_LAW_ALIASES, ...FIRE_LAWS].sort((a, b) => b.length - a.length)) {
    if (compact.includes(name.replace(/\s+/g, ""))) return name
  }
  return undefined
}

function cleanQuery(q: string): string {
  return q
    .replace(/판례|검색|조회|알려\s*줘|보여\s*줘|찾아\s*줘|해\s*줘|주세요|입니까|인가요|[?？.!]/g, "")
    .trim()
}

export function routeQuestion(q: string): RoutedQuery {
  const law = extractLawName(q)
  const jo = extractJo(q)

  if (/판례|판결|재판/.test(q)) {
    return { tool: "search_fire_precedents", args: { query: cleanQuery(q) || q } }
  }
  if (law && jo) {
    return { tool: "get_fire_law_text", args: { lawName: law, jo } }
  }
  if (law || /법령|법률|시행령|시행규칙/.test(q)) {
    return { tool: "search_fire_law", args: { query: law ?? cleanQuery(q) } }
  }
  const date = extractDate(q)
  if (/화재|불이|출동/.test(q) && date) {
    return { tool: "search_fire_stats", args: { date } }
  }
  if (/구급|이송|응급/.test(q)) {
    const sido = extractSido(q)
    if (sido) {
      // 구급통계 API의 시도본부 명칭 관례 (예: 서울소방재난본부)
      const hq = `${Object.entries(SIDO).find(([, f]) => f === sido)![0]}소방재난본부`
      const month = extractDate(q)?.slice(0, 6)
      return { tool: "get_ems_stats", args: { sido: hq, ...(month ? { month } : {}) } }
    }
  }
  if (/소방시설|대상물|스프링클러|소화|경보설비|건물/.test(q)) {
    const sido = extractSido(q)
    if (sido) return { tool: "search_fire_building", args: { sido } }
  }
  // 기본: 법령 검색으로 (소방 도메인 질문의 최다 케이스)
  return { tool: "search_fire_law", args: { query: cleanQuery(q) || q } }
}
