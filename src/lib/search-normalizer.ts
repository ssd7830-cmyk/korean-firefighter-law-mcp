/**
 * 소방 법령 별칭 → 정식 법령명 해석
 * 실무에서 부르는 약칭을 법제처 검색이 먹는 정식 명칭으로 변환한다.
 */

export const FIRE_LAWS: readonly string[] = [
  "소방기본법",
  "화재의 예방 및 안전관리에 관한 법률",
  "소방시설 설치 및 관리에 관한 법률",
  "소방시설공사업법",
  "위험물안전관리법",
  "119구조ㆍ구급에 관한 법률",
  "소방공무원법",
  "소방의 화재조사에 관한 법률",
  "다중이용업소의 안전관리에 관한 특별법",
  "의용소방대 설치 및 운영에 관한 법률",
  "소방장비관리법",
  "초고층 및 지하연계 복합건축물 재난관리에 관한 특별법",
]

const ALIASES: Record<string, string> = {
  화재예방법: "화재의 예방 및 안전관리에 관한 법률",
  소방시설법: "소방시설 설치 및 관리에 관한 법률",
  소방공사업법: "소방시설공사업법",
  공사업법: "소방시설공사업법",
  위험물법: "위험물안전관리법",
  구조구급법: "119구조ㆍ구급에 관한 법률",
  "119법": "119구조ㆍ구급에 관한 법률",
  화재조사법: "소방의 화재조사에 관한 법률",
  다중이용업소법: "다중이용업소의 안전관리에 관한 특별법",
  다중법: "다중이용업소의 안전관리에 관한 특별법",
  의용소방대법: "의용소방대 설치 및 운영에 관한 법률",
  초고층법: "초고층 및 지하연계 복합건축물 재난관리에 관한 특별법",
}

export function resolveFireLawAlias(query: string): string {
  // 실무자는 "화재 예방법"처럼 띄어 쓰기도 하므로 공백 제거본으로 판정한다
  const q = query.trim().replace(/\s+/g, "")
  // "화재예방법 시행령" 같은 복합 입력: 본법 별칭만 치환하고 꼬리(시행령 등)는 보존
  for (const [alias, canonical] of Object.entries(ALIASES)) {
    if (q === alias) return canonical
    if (q.startsWith(alias)) {
      const rest = q.slice(alias.length)
      return rest ? `${canonical} ${rest}` : canonical
    }
  }
  return query.trim()
}

/**
 * 조번호 문자열 → 법제처 JO 파라미터 (조 4자리 + 가지 2자리)
 * "10" | "제10조" → "001000", "10의2" | "제10조의2" → "001002"
 */
export function toJoCode(jo: string): string {
  const cleaned = jo.replace(/\s+/g, "").replace(/^제/, "").replace(/조(?=의|$)/, "")
  const m = cleaned.match(/^(\d+)(?:의(\d+))?$/)
  if (!m) throw new Error(`조번호 형식을 해석할 수 없습니다: "${jo}" (예: "제10조", "10", "10의2")`)
  const main = m[1].padStart(4, "0")
  const branch = (m[2] ?? "0").padStart(2, "0")
  return main + branch
}
