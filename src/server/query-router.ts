/**
 * 질문 → 조회 도구 라우팅 (키워드 기반, AI 판단 개입 없음 — 조회를 코드로 강제)
 */

import { FIRE_LAWS, FIRE_LAW_ALIASES } from "../lib/search-normalizer.js"
import { isValidCompactDate, isValidCompactMonth, koreanDate } from "../lib/korean-date.js"

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

const EMS_HQ: ReadonlyArray<readonly [string, string]> = [
  ["경기북부", "경기북부소방재난본부"],
  ["서울", "서울소방재난본부"],
  ["부산", "부산소방재난본부"],
  ["대구", "대구소방안전본부"],
  ["인천", "인천소방본부"],
  ["대전", "대전소방본부"],
  ["울산", "울산소방본부"],
  ["세종", "세종소방본부"],
  ["경기", "경기소방재난본부"],
  ["강원", "강원소방본부"],
  ["충북", "충북소방본부"],
  ["충남", "충남소방본부"],
  ["전북", "전북소방본부"],
  ["경북", "경북소방본부"],
  ["경남", "경남소방본부"],
  ["제주", "제주소방안전본부"],
  ["창원", "창원소방본부"],
]

function extractEmsHq(q: string, month?: string): string | undefined {
  // 전남·광주는 2026-07-01 통합 전후의 당시 기관명으로 조회한다.
  if (q.includes("광주") || q.includes("전남") || q.includes("전라남도")) {
    if (!month || month >= "202607") return "전남광주통합특별시소방본부"
    return q.includes("광주") ? "광주소방안전본부" : "전남소방본부"
  }
  return EMS_HQ.find(([name]) => q.includes(name))?.[1]
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
  if (m8) return isValidCompactDate(m8[1]) ? m8[1] : undefined
  const m = q.match(/(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})일?/)
  if (m) {
    const value = `${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`
    return isValidCompactDate(value) ? value : undefined
  }
  const rel = /어제/.test(q) ? -1 : /오늘/.test(q) ? 0 : undefined
  if (rel !== undefined) return koreanDate(rel).compact
  return undefined
}

function extractMonth(q: string): string | undefined {
  const compact = q.match(/\b(\d{6})\b/)
  if (compact) return isValidCompactMonth(compact[1]) ? compact[1] : undefined
  const m = q.match(/(\d{4})[.\-/년]\s*(\d{1,2})월?/)
  if (m) {
    const value = `${m[1]}${m[2].padStart(2, "0")}`
    return isValidCompactMonth(value) ? value : undefined
  }
  return extractDate(q)?.slice(0, 6)
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
    .replace(/관련된?|에\s*대해서?|판례|검색|조회|알려\s*줘|보여\s*줘|찾아\s*줘|해\s*줘|주세요|입니까|인가요|[?？.!]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function extractAdminRuleQuery(q: string): string {
  const facility = q.match(
    /간이스프링클러|스프링클러|자동화재탐지설비|옥내소화전|옥외소화전|연결송수관설비|비상방송설비|제연설비|유도등|방화문|소화기구?/
  )?.[0]
  return facility ?? (cleanQuery(q) || q)
}

function extractBuildingName(q: string, sido: string): string | undefined {
  let name = q
  const location = Object.entries(SIDO).find(([, full]) => full === sido)
  if (location) {
    const [short, full] = location
    if (name.includes(full)) name = name.replace(full, " ")
    else name = name.replace(new RegExp(`(^|\\s)${short}(?=\\s|$)`), "$1 ")
  }
  name = name
    .replace(
      /특정소방대상물|소방대상물|소방시설|스프링클러|간이스프링클러|소화설비|경보설비|설치(?:된|여부)?|현황|건물|검색|조회|보여\s*줘|알려\s*줘/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim()
  return name || undefined
}

export function routeQuestion(q: string): RoutedQuery {
  const law = extractLawName(q)
  const jo = extractJo(q)

  if (/판례|판결|재판/.test(q)) {
    return { tool: "search_fire_precedents", args: { query: cleanQuery(q) || q } }
  }
  if (
    /화재안전기준|화재안전성능기준|화재안전기술기준|NFPC|NFTC|행정규칙|고시|훈령/i.test(q) ||
    (/간이스프링클러|스프링클러|자동화재탐지설비|옥내소화전|옥외소화전|연결송수관설비|비상방송설비|제연설비|유도등|방화문|소화기구?/.test(q) &&
      /설치\s*(?:기준|규정|요건)|기술\s*기준|성능\s*기준|어떻게\s*설치/.test(q))
  ) {
    return { tool: "search_fire_admin_rules", args: { query: extractAdminRuleQuery(q) } }
  }
  // 법령명(위험물안전관리법 등)이 잡혔으면 법령 질문이므로 위험물 물질 검색으로 보내지 않는다
  if (!law && /위험물|CAS\s*번호|UN\s*번호/i.test(q)) {
    const query = cleanQuery(q)
      .replace(/위험물|물질|여부|인지|이야|맞아|CAS\s*번호|UN\s*번호/gi, "")
      .replace(/\s+/g, " ")
      .trim()
    if (query) return { tool: "search_hazmat", args: { query } }
  }
  if (law && jo) {
    return { tool: "get_fire_law_text", args: { lawName: law, jo } }
  }
  if (law || /법령|법률|시행령|시행규칙/.test(q)) {
    return { tool: "search_fire_law", args: { query: law ?? cleanQuery(q) } }
  }
  if (/구급|이송|응급/.test(q)) {
    const month = extractMonth(q)
    const hq = extractEmsHq(q, month)
    if (hq) {
      return { tool: "get_ems_stats", args: { sido: hq, ...(month ? { month } : {}) } }
    }
  }
  const date = extractDate(q)
  if (/화재|불이/.test(q) && date) {
    return { tool: "search_fire_stats", args: { date } }
  }
  if (/소방시설|스프링클러|소화설비|경보설비/.test(q)) {
    const sido = extractSido(q)
    if (sido) {
      const buildingName = extractBuildingName(q, sido)
      return { tool: "get_building_facilities", args: { sido, ...(buildingName ? { buildingName } : {}) } }
    }
  }
  if (/대상물|건물/.test(q)) {
    const sido = extractSido(q)
    if (sido) {
      const buildingName = extractBuildingName(q, sido)
      return { tool: "search_fire_building", args: { sido, ...(buildingName ? { buildingName } : {}) } }
    }
  }
  // 기본: 법령 검색으로 (소방 도메인 질문의 최다 케이스)
  return { tool: "search_fire_law", args: { query: cleanQuery(q) || q } }
}
