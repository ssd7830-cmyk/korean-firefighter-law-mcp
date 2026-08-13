import { toArray } from "./xml.js"
import type { DataGoKrBody } from "./fire-api-client.js"

/** 주요 필드 한글 라벨 (없는 키는 원문 그대로 출력) */
const LABELS: Record<string, string> = {
  ocrn_ymd: "발생일자",
  fire_sttus_cnt: "화재접수건수",
  sidoHqOgidNm: "시도본부",
  rsacGutFsttOgidNm: "출동소방서",
  rcptYm: "접수년월",
  gutCo: "출동건수",
  trnfCo: "이송건수",
  trnfPcnt: "이송환자수",
  totalCount: "전체건수",
}

/** data.go.kr 응답 body → 읽을 수 있는 텍스트. 필드명이 서비스마다 달라 범용 key: value로 출력 */
export function formatBody(body: DataGoKrBody, title: string, maxItems = 50): string {
  const items = toArray<Record<string, unknown>>(body.items?.item as any)
  const total = body.totalCount ?? items.length
  if (items.length === 0) {
    return `${title}\n결과 없음 (totalCount: ${total}). 파라미터(날짜 형식·지역명)를 확인하세요.`
  }
  const lines = items.slice(0, maxItems).map((item, i) => {
    const fields = Object.entries(item)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${LABELS[k] ?? k}: ${v}`)
      .join(" | ")
    return `${i + 1}. ${fields}`
  })
  const truncated = items.length > maxItems ? `\n… 외 ${items.length - maxItems}건 생략` : ""
  return `${title} (전체 ${total}건)\n${lines.join("\n")}${truncated}`
}

/** 결과 내 키워드 필터. totalCount는 필터 후 개수로 갱신한다 (원본 전체건수를 보여주면 오독) */
export function filterBodyByKeyword(body: DataGoKrBody, keyword: string): DataGoKrBody {
  const items = toArray<Record<string, unknown>>(body.items?.item as any).filter((it) =>
    JSON.stringify(it).includes(keyword)
  )
  return { items: { item: items }, totalCount: items.length }
}

/** 응답 길이 제한 (LLM 컨텍스트 보호) */
export function truncate(text: string, max = 8000): string {
  if (text.length <= max) return text
  return text.slice(0, max) + `\n… (${text.length - max}자 생략 — 조번호나 페이지를 지정해 좁혀서 조회하세요)`
}
