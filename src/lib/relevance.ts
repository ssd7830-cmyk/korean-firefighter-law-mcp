/**
 * 본문검색 폴백 결과 재정렬 — 법제처 API는 관련도 정렬이 없다(실측: sort는 발령일자 등
 * 메타데이터 정렬만). 기본 가나다순 상위 N건만 자르면 무관 부처 규정이 앞을 차지하므로,
 * 전량(최대 100건)을 받아 로컬에서 소방 관련도순으로 정렬한다.
 * 점수: 제목에 질의어 포함(+2) + 우선 소관부처(+1). 동점은 API 원래 순서(가나다) 유지.
 */
export function rankBodySearch<T>(
  items: T[],
  query: string,
  fields: (item: T) => { title: string; dept: string },
  priorityDepts: readonly string[]
): T[] {
  const score = (item: T): number => {
    const { title, dept } = fields(item)
    return (title.includes(query) ? 2 : 0) + (priorityDepts.some((d) => dept.includes(d)) ? 1 : 0)
  }
  return [...items].sort((a, b) => score(b) - score(a)) // Node 22의 sort는 stable
}
