import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const dynamic = "force-dynamic";

const handler = toNextJsHandler(auth);

async function withAuthErrorLogging(
  method: "GET" | "POST",
  req: Request
): Promise<Response> {
  try {
    // #region agent log
    fetch("http://127.0.0.1:7512/ingest/356f6776-4866-47b5-9aec-f04790f78e37", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "86b1be" },
      body: JSON.stringify({
        sessionId: "86b1be",
        runId: "auth-500",
        hypothesisId: "H2",
        location: "api/auth/route.ts",
        message: "Auth handler invoked",
        data: {
          method,
          path: new URL(req.url).pathname,
          hasSecret: Boolean(process.env.BETTER_AUTH_SECRET?.trim()),
          hasDb: Boolean(process.env.DATABASE_URL),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const res = method === "GET" ? await handler.GET(req) : await handler.POST(req);
    return res;
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    // #region agent log
    fetch("http://127.0.0.1:7512/ingest/356f6776-4866-47b5-9aec-f04790f78e37", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "86b1be" },
      body: JSON.stringify({
        sessionId: "86b1be",
        runId: "auth-500",
        hypothesisId: "H3",
        location: "api/auth/route.ts:catch",
        message: "Auth handler threw",
        data: { method, error: message.slice(0, 300) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    console.error("[auth route]", message);
    return Response.json(
      { error: "Auth failed", message },
      { status: 500 }
    );
  }
}

export function GET(req: Request) {
  return withAuthErrorLogging("GET", req);
}

export function POST(req: Request) {
  return withAuthErrorLogging("POST", req);
}
