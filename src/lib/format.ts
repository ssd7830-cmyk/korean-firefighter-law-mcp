import { toArray } from "./xml.js"
import type { DataGoKrBody } from "./fire-api-client.js"

/** 주요 필드 한글 라벨 — 활용가이드 문서 국문명 기준 (없는 키는 원문 그대로 출력) */
const LABELS: Record<string, string> = {
  // 구급통계
  sidoHqOgidNm: "시도본부",
  rsacGutFsttOgidNm: "출동소방서",
  rcptYm: "접수년월",
  gutCo: "출동건수",
  trnfCo: "이송건수",
  trnfPcnt: "이송환자수",
  totalCount: "전체건수",
  // 화재발생현황
  OCRN_YMD: "발생일자",
  SIDO_HQ_FRST_CETR_NM: "시도본부",
  FRST_CETR_NM: "소방서센터",
  FIRE_RCPT_MNB: "화재접수",
  FIRE_PROG_MNB: "화재진행",
  FALS_DCLR_MNB: "허위신고",
  SLF_EXTSH_MNB: "자체진화",
  FLSRP_PRCS_MNB: "오보처리",
  STN_END_MNB: "상황종료",
  // 특정소방대상물·소방시설
  objNm: "대상물명",
  bassAdres: "주소",
  ctpvNm: "시도",
  sggNm: "시군구",
  dongNm: "읍면동",
  mainPrposNm: "주용도",
  useAprvYmd: "사용승인일",
  bildSn: "건축물일련번호",
  cmpfrsttNm: "소방서",
  cmpn119scNm: "119센터",
  useYn: "사용여부",
  regYmd: "등록일자",
  sprklHYn: "스프링클러(H)",
  sprklAvYn: "스프링클러(AV)",
  spskHYn: "간이스프링클러(H)",
  spskAvYn: "간이스프링클러(AV)",
  frspnSprklHYn: "조기진압스프링클러(H)",
  frspnSprklAvYn: "조기진압스프링클러(AV)",
}

/** data.go.kr 응답 body → 읽을 수 있는 텍스트. 필드명이 서비스마다 달라 범용 key: value로 출력 */
export function formatBody(body: DataGoKrBody, title: string, maxItems = 50): string {
  const items = toArray<Record<string, unknown>>(body.items?.item as any)
  const total = body.totalCount ?? items.length
  if (items.length === 0) {
    return `${title}\n결과 없음 (totalCount: ${total}). 파라미터(날짜 형식·지역명)를 확인하세요.`
  }
  const shown = Math.min(items.length, maxItems)
  const lines = items.slice(0, shown).map((item, i) => {
    const fields = Object.entries(item)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${LABELS[k] ?? k}: ${String(v).replace(/\r?\n|<br\s*\/?>/gi, " ").trim()}`)
      .join(" | ")
    return `${i + 1}. ${fields}`
  })
  const parsedTotal = Number(total)
  const knownCount = Number.isFinite(parsedTotal) && parsedTotal >= items.length ? parsedTotal : items.length
  const omitted = Math.max(0, knownCount - shown)
  const truncated = omitted > 0 ? `\n… 외 ${omitted}건 생략` : ""
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
