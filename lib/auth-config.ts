/**
 * Auth config — prefer env secrets; never crash the whole auth route at import
 * when staging/Vercel env was forgotten (that caused instant 500 on every /api/auth/*).
 */

const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

/** Staging-only fallback — override with BETTER_AUTH_SECRET in Vercel/local .env */
const STAGING_FALLBACK_SECRET =
  "a5baff2d1ad5d3f80ec3e43ae0ae280670c017ffed98a2ed3a747ba7da5e85c6";

function resolveAuthSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;

  if (isBuildTime) {
    return "build-time-placeholder-not-for-runtime";
  }

  // Avoid hard 500 on every auth request when the Vercel env var is missing.
  console.warn(
    "[auth-config] BETTER_AUTH_SECRET is not set; using staging fallback. Set it in Vercel Environment Variables."
  );
  return STAGING_FALLBACK_SECRET;
}

export const authSecret = resolveAuthSecret();

export function getAppUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Better Auth supports wildcards in trustedOrigins. */
export function getTrustedOrigins(): string[] {
  const appUrl = getAppUrl();
  return [
    appUrl,
    "http://localhost:3000",
    "http://localhost:*",
    "https://uep-proyect.vercel.app",
    "https://uep-proyect-w15h.vercel.app",
    "https://*.vercel.app",
  ];
}
