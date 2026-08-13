export function httpPort(value: string | undefined): number {
  if (value === undefined || value === "") return 8080
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT는 1~65535 범위의 정수여야 합니다.")
  }
  return parsed
}
