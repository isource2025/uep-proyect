/**
 * Auth config — secrets must come from env (never hardcode).
 * During `next build`, Next imports route modules to collect page data;
 * allow a non-functional placeholder only in that phase so Vercel can compile.
 */

/** True while Next is compiling / collecting page data (not server runtime). */
const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.npm_lifecycle_event === "build";

function resolveAuthSecret(): string {
  const fromEnv = process.env.BETTER_AUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;

  // Allow `next build` / Vercel compile without the secret; runtime still requires it.
  if (isBuildTime) {
    return "build-time-placeholder-not-for-runtime";
  }

  throw new Error(
    "❌ BETTER_AUTH_SECRET environment variable is not defined. Set it in .env (local) or Vercel → Settings → Environment Variables."
  );
}

export const authSecret = resolveAuthSecret();

export function getAppUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Better Auth supports wildcards in trustedOrigins. */
export function getTrustedOrigins(): string[] {
  return [
    "http://localhost:3000",
    "http://localhost:*",
    "https://uep-proyect.vercel.app",
    "https://*.vercel.app",
  ];
}
