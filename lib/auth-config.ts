export const authSecret = process.env.BETTER_AUTH_SECRET;
if (!authSecret) {
  throw new Error("❌ BETTER_AUTH_SECRET environment variable is not defined in .env!");
}

export function getAppUrl(): string {
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
