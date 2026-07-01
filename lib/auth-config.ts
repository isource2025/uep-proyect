function getAppUrl(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export const appUrl = getAppUrl();

// Fallback for staging/preview when env var is missing on Vercel.
export const authSecret =
  process.env.BETTER_AUTH_SECRET ?? "uep-staging-dev-secret-2026-not-production";

export const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  "http://localhost:3000",
].filter((value): value is string => Boolean(value));
