export function httpPort(value: string | undefined): number {
  if (value === undefined || value === "") return 8080
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error("PORT는 1~65535 범위의 정수여야 합니다.")
  }
  return parsed
}

export function httpHost(value: string | undefined): string {
  const host = value?.trim() || "127.0.0.1"
  if (!/^[a-zA-Z0-9.:[\]-]+$/.test(host)) throw new Error("HOST 형식이 올바르지 않습니다.")
  return host
}

export function requireAuthForPublicHost(host: string, serverToken?: string, chatToken?: string): void {
  if (["127.0.0.1", "::1", "localhost"].includes(host)) return
  if (!serverToken || !(chatToken || serverToken)) {
    throw new Error("외부 HOST로 공개하려면 SERVER_AUTH_TOKEN과 CHAT_AUTH_TOKEN(또는 공용 SERVER_AUTH_TOKEN)이 필요합니다.")
  }
}
