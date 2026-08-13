import { XMLParser } from "fast-xml-parser"

const parser = new XMLParser({
  ignoreAttributes: false,
  parseTagValue: false, // 날짜 "20250101"이 숫자로 변형되는 것 방지
  trimValues: true,
})

export function parseXml(text: string): any {
  return parser.parse(text)
}

/** 단일 객체/배열 혼재 응답을 항상 배열로 */
export function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return []
  return Array.isArray(v) ? v : [v]
}
