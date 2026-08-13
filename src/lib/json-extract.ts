/** 코드펜스·설명 속 첫 JSON 객체를 문자열/이스케이프를 존중해 추출한다. */
export function extractFirstJsonObject(text: string): unknown | null {
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0
    let quoted = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const char = text[i]
      if (quoted) {
        if (escaped) escaped = false
        else if (char === "\\") escaped = true
        else if (char === '"') quoted = false
        continue
      }
      if (char === '"') quoted = true
      else if (char === "{") depth++
      else if (char === "}" && --depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) }
        catch { break }
      }
    }
  }
  return null
}
