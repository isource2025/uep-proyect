/** Staging/dev only — no env vars required for auth. */

const DEV_AUTH_SECRET = "uep-staging-dev-secret-2026-not-production";

export function getAppUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const authSecret = DEV_AUTH_SECRET;

export function getTrustedOrigins(): string[] {
  const origins = new Set<string>(["http://localhost:3000", "https://uep-proyect.vercel.app"]);

  if (process.env.VERCEL_URL) {
    origins.add(`https://${process.env.VERCEL_URL}`);
  }

  return [...origins];
}
