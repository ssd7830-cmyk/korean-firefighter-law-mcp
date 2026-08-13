const DAY_MS = 24 * 60 * 60 * 1000

/** 서버 시간대와 무관하게 대한민국 날짜를 반환한다. */
export function koreanDate(offsetDays = 0): { compact: string; iso: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + offsetDays * DAY_MS))
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ""
  const year = value("year")
  const month = value("month")
  const day = value("day")
  return { compact: `${year}${month}${day}`, iso: `${year}-${month}-${day}` }
}

export function isValidCompactMonth(value: string): boolean {
  if (!/^\d{6}$/.test(value)) return false
  const month = Number(value.slice(4, 6))
  return month >= 1 && month <= 12
}

export function isValidCompactDate(value: string): boolean {
  if (!/^\d{8}$/.test(value) || !isValidCompactMonth(value.slice(0, 6))) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6))
  const day = Number(value.slice(6, 8))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= days[month - 1]
}
