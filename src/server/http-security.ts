import { createHash, timingSafeEqual } from "node:crypto"
import type { ServerResponse } from "node:http"

export function authorized(authorization: string | undefined, token: string): boolean {
  if (!authorization?.startsWith("Bearer ")) return false
  const supplied = authorization.slice("Bearer ".length)
  const actualHash = createHash("sha256").update(supplied).digest()
  const expectedHash = createHash("sha256").update(token).digest()
  return timingSafeEqual(actualHash, expectedHash)
}

export function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("Cache-Control", "no-store")
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'"
  )
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  res.setHeader("Referrer-Policy", "no-referrer")
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("X-Frame-Options", "DENY")
}
