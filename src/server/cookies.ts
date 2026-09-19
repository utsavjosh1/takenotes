/**
 * Cookie contract for the self-hosted server (Gate C).
 *
 * Production (HTTPS): `__Host-` prefix REQUIRES `Secure`, `Path=/`, and no
 * `Domain` — browsers reject `__Host-` cookies otherwise. CSRF token travels
 * in the login JSON body (readable by JS) and back in `x-csrf-token`.
 *
 * Insecure relaxation (plain local HTTP only): `Secure` cookies are dropped
 * by browsers over http, so dev/test over http://localhost (or explicit
 * `TAKENOTES_INSECURE_HTTP=1`) falls back to a non-`__Host-` name WITHOUT
 * `Secure`. Everything else (`HttpOnly`, `SameSite=Strict`, `Path=/`, no
 * `Domain`, explicit CSRF) stays identical. Production must never enable it.
 */

export const PRODUCTION_COOKIE_NAME = "__Host-takenotes-session";
export const INSECURE_COOKIE_NAME = "takenotes-session";
export const CSRF_HEADER = "x-csrf-token";

export function cookieNameFor(insecureHttp: boolean): string {
  return insecureHttp ? INSECURE_COOKIE_NAME : PRODUCTION_COOKIE_NAME;
}

/** Build a `Set-Cookie` value. `maxAgeSeconds` omitted → session cookie. */
export function buildSetCookie(sessionId: string, insecureHttp: boolean, maxAgeSeconds?: number): string {
  const parts = [`${cookieNameFor(insecureHttp)}=${sessionId}`, "Path=/", "HttpOnly", "SameSite=Strict"];
  if (!insecureHttp) parts.push("Secure");
  if (maxAgeSeconds !== undefined) parts.push(`Max-Age=${maxAgeSeconds}`);
  return parts.join("; ");
}

/** Clearing header: expired cookie with identical scope attributes. */
export function buildClearCookie(insecureHttp: boolean): string {
  return buildSetCookie("", insecureHttp, 0);
}

export function parseCookies(header: string | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    if (!name) continue;
    out.set(name, part.slice(idx + 1).trim());
  }
  return out;
}

/** Assert the locked production contract on a `Set-Cookie` value. Throws on violation. */
export function assertProductionCookieContract(setCookie: string): void {
  const failures: string[] = [];
  if (!setCookie.startsWith(`${PRODUCTION_COOKIE_NAME}=`)) failures.push("must use __Host- prefix");
  if (!/;\s*Secure([;\s]|$)/i.test(setCookie)) failures.push("must include Secure");
  if (!/;\s*HttpOnly([;\s]|$)/i.test(setCookie)) failures.push("must include HttpOnly");
  if (!/;\s*SameSite=Strict([;\s]|$)/i.test(setCookie)) failures.push("must include SameSite=Strict");
  if (!/;\s*Path=\/([;\s]|$)/.test(setCookie)) failures.push("must include Path=/");
  if (/;\s*Domain=/i.test(setCookie)) failures.push("must not include Domain");
  if (failures.length > 0) throw new Error(`Cookie contract violated: ${failures.join(", ")} (${setCookie})`);
}
