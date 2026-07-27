import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function parseDbTarget(raw: string | undefined) {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/^["']|["']$/g, "");
  const withoutScheme = cleaned.replace(/^sqlserver:\/\//i, "");
  const parts = withoutScheme.split(";");
  const hostPort = parts[0] || "";
  const [host, portStr] = hostPort.split(":");
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf("=");
    if (eq === -1) continue;
    const key = parts[i].slice(0, eq).trim().toLowerCase();
    const val = parts[i].slice(eq + 1).trim();
    params[key] = val;
  }
  return {
    host: host || null,
    port: portStr ? Number(portStr) : 1433,
    database: params.database || null,
    user: params.user || null,
    // fingerprint only — never expose password
    urlLength: cleaned.length,
    looksLikeOldDevIp: cleaned.includes("181.98.96.200"),
    looksLikePublicWebdev: cleaned.includes("190.231.14.131"),
  };
}

/**
 * Diagnostics for Vercel env / DB (no Better Auth import).
 */
export async function GET() {
  const dbTarget = parseDbTarget(process.env.DATABASE_URL);

  let dbOk = false;
  let dbError: string | null = null;
  let adminFound: boolean | null = null;
  let serverName: string | null = null;

  try {
    const { prisma } = await import("@/lib/prisma");
    const meta = await prisma.$queryRawUnsafe<Array<{ serverName: string; dbName: string }>>(
      "SELECT @@SERVERNAME AS serverName, DB_NAME() AS dbName"
    );
    serverName = meta?.[0]?.serverName ?? null;
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
    ok: dbOk,
    expected: {
      host: "190.231.14.131",
      database: "UEP",
      hint: "If dbTarget.host is still 181.98.96.200, Vercel env was NOT updated for this deployment. Edit Production DATABASE_URL and Redeploy.",
    },
    env: {
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
      hasAuthSecret: Boolean(process.env.BETTER_AUTH_SECRET?.trim()),
      hasAuthUrl: Boolean(process.env.BETTER_AUTH_URL?.trim()),
      betterAuthUrl: process.env.BETTER_AUTH_URL || null,
      vercelUrl: process.env.VERCEL_URL || null,
      vercelEnv: process.env.VERCEL_ENV || null,
    },
    dbTarget,
    db: {
      ok: dbOk,
      serverName,
      adminFound,
      error: dbError,
    },
  });
}
