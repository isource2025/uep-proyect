import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight diagnostics for Vercel env / DB (does not import Better Auth).
 */
export async function GET() {
  // #region agent log
  const payload = {
    sessionId: "86b1be",
    runId: "auth-500",
    hypothesisId: "H1",
    location: "api/health/route.ts",
    message: "Health probe env flags",
    data: {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasAuthSecret: Boolean(process.env.BETTER_AUTH_SECRET?.trim()),
      hasAuthUrl: Boolean(process.env.BETTER_AUTH_URL?.trim()),
      betterAuthUrl: process.env.BETTER_AUTH_URL || null,
      vercelUrl: process.env.VERCEL_URL || null,
      nodeEnv: process.env.NODE_ENV || null,
    },
    timestamp: Date.now(),
  };
  fetch("http://127.0.0.1:7512/ingest/356f6776-4866-47b5-9aec-f04790f78e37", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "86b1be" },
    body: JSON.stringify(payload),
  }).catch(() => {});
  // #endregion

  let dbOk = false;
  let dbError: string | null = null;
  let adminFound: boolean | null = null;

  try {
    const { prisma } = await import("@/lib/prisma");
    const admin = await prisma.user.findFirst({
      where: { email: "admin@uep.gov.ar" },
      select: { id: true, email: true },
    });
    adminFound = Boolean(admin);
    dbOk = true;
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    ok: dbOk && Boolean(process.env.DATABASE_URL),
    env: {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasAuthSecret: Boolean(process.env.BETTER_AUTH_SECRET?.trim()),
      hasAuthUrl: Boolean(process.env.BETTER_AUTH_URL?.trim()),
      betterAuthUrl: process.env.BETTER_AUTH_URL || null,
      vercelUrl: process.env.VERCEL_URL || null,
    },
    db: {
      ok: dbOk,
      adminFound,
      error: dbError,
    },
  });
}
