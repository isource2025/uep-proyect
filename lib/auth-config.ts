/** Staging/dev only — no env vars required for auth. */

const DEV_AUTH_SECRET = "uep-staging-dev-secret-2026-not-production";

export function getAppUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const authSecret = DEV_AUTH_SECRET;

/** Better Auth supports wildcards in trustedOrigins. */
export function getTrustedOrigins(): string[] {
  return [
    "http://localhost:3000",
    "http://localhost:*",
    "https://uep-proyect.vercel.app",
    "https://*.vercel.app",
  ];
}
