#!/usr/bin/env node
/**
 * Verifica / sincroniza env de Vercel contra los valores esperados del portal UEP.
 *
 * Uso:
 *   node scripts/verify-vercel-env.mjs              # solo chequea /api/health + login
 *   node scripts/verify-vercel-env.mjs --pull       # lista env via Vercel CLI (requiere login)
 *   node scripts/verify-vercel-env.mjs --sync       # crea/actualiza env faltantes via CLI
 *
 * Auth CLI (una vez):
 *   npx vercel login
 *   npx vercel link
 *
 * O con token:
 *   set VERCEL_TOKEN=xxxxx
 */

import { execSync, spawnSync } from "node:child_process";
import { writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const APP_URL = process.env.UEP_APP_URL || "https://uep-proyect-w15h.vercel.app";
const LOG = join(process.cwd(), "debug-86b1be.log");

const EXPECTED = {
  DATABASE_URL:
    "sqlserver://190.231.14.131:1433;database=UEP;user=sa;password=isource;encrypt=false;trustServerCertificate=true",
  BETTER_AUTH_SECRET:
    "a5baff2d1ad5d3f80ec3e43ae0ae280670c017ffed98a2ed3a747ba7da5e85c6",
  BETTER_AUTH_URL: "https://uep-proyect-w15h.vercel.app",
};

const args = new Set(process.argv.slice(2));
const doPull = args.has("--pull");
const doSync = args.has("--sync");

function log(hypothesisId, message, data) {
  const line = JSON.stringify({
    sessionId: "86b1be",
    hypothesisId,
    location: "verify-vercel-env.mjs",
    message,
    data,
    timestamp: Date.now(),
    runId: "vercel-env-check",
  });
  appendFileSync(LOG, line + "\n");
  console.log(`[${hypothesisId}] ${message}`);
  console.log(JSON.stringify(data, null, 2));
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  return { status: res.status, text: text.slice(0, 500), json };
}

function runVercel(argv, input) {
  const env = { ...process.env };
  const r = spawnSync("npx", ["vercel", ...argv], {
    encoding: "utf8",
    input,
    env,
    shell: true,
  });
  return {
    status: r.status,
    stdout: (r.stdout || "").trim(),
    stderr: (r.stderr || "").trim(),
  };
}

function normalize(value) {
  return String(value || "")
    .trim()
    .replace(/^["']|["']$/g, "");
}

function compareValue(key, actual) {
  const expected = EXPECTED[key];
  const a = normalize(actual);
  const e = normalize(expected);
  return {
    key,
    match: a === e,
    expectedPreview:
      key === "BETTER_AUTH_SECRET" ? e.slice(0, 8) + "…" + e.slice(-6) : e,
    actualPreview: a
      ? key === "BETTER_AUTH_SECRET"
        ? a.slice(0, 8) + "…" + a.slice(-6)
        : a
      : "(missing)",
  };
}

async function checkRuntime() {
  console.log("\n=== 1) Runtime probe:", APP_URL, "===\n");

  const health = await fetchJson(`${APP_URL}/api/health`);
  log("H1", "GET /api/health", {
    status: health.status,
    body: health.json || health.text,
  });

  const session = await fetchJson(`${APP_URL}/api/auth/get-session`, {
    headers: { Accept: "application/json" },
  });
  log("H2", "GET /api/auth/get-session", {
    status: session.status,
    body: session.json || session.text,
  });

  const signIn = await fetchJson(`${APP_URL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: APP_URL,
      Accept: "application/json",
    },
    body: JSON.stringify({
      email: "admin@uep.gov.ar",
      password: "admin123",
    }),
  });
  log("H3", "POST /api/auth/sign-in/email", {
    status: signIn.status,
    body: signIn.json || signIn.text,
  });

  return { health, session, signIn };
}

function listEnvViaCli() {
  console.log("\n=== 2) Vercel CLI env ls ===\n");
  const who = runVercel(["whoami"]);
  if (who.status !== 0) {
    log("H4", "Vercel CLI not authenticated", {
      stderr: who.stderr || who.stdout,
      hint: "Run: npx vercel login",
    });
    return null;
  }
  log("H4", "Vercel whoami", { user: who.stdout });

  const ls = runVercel(["env", "ls"]);
  log("H5", "vercel env ls", {
    status: ls.status,
    stdout: ls.stdout,
    stderr: ls.stderr,
  });
  return ls.stdout;
}

function syncEnvViaCli() {
  console.log("\n=== 3) Sync expected env to Vercel (Production/Preview/Development) ===\n");

  const targets = ["production", "preview", "development"];

  for (const [key, value] of Object.entries(EXPECTED)) {
    for (const target of targets) {
      // Remove existing (ignore errors), then add fresh
      runVercel(["env", "rm", key, target, "-y"]);
      const add = runVercel(
        ["env", "add", key, target],
        value + "\n"
      );
      const ok = add.status === 0;
      log("H6", `env upsert ${key} @ ${target}`, {
        ok,
        stdout: add.stdout.slice(0, 200),
        stderr: add.stderr.slice(0, 200),
      });
    }
  }

  console.log(
    "\nListo. Hacé Redeploy en Vercel para que tome las variables nuevas.\n"
  );
}

function printExpectedCopyPaste() {
  console.log("\n=== Valores esperados (copy/paste Vercel Dashboard) ===\n");
  for (const [k, v] of Object.entries(EXPECTED)) {
    console.log(`${k}=${v}`);
  }
  console.log("");
}

async function main() {
  writeFileSync(LOG, "");
  printExpectedCopyPaste();

  const runtime = await checkRuntime();

  if (doPull || doSync) {
    listEnvViaCli();
  }

  if (doSync) {
    syncEnvViaCli();
    console.log("Re-probando runtime luego del sync (puede requerir redeploy)...\n");
    await checkRuntime();
  }

  // Verdict
  const healthOk = runtime.health.status === 200 && runtime.health.json?.ok;
  const authAlive = runtime.session.status !== 500;
  const loginOk = runtime.signIn.status === 200;

  const verdict = {
    healthEndpointDeployed: runtime.health.status !== 404,
    healthOk: Boolean(healthOk),
    authNotCrashing: authAlive,
    loginOk,
    envFromHealth: runtime.health.json?.env || null,
    dbFromHealth: runtime.health.json?.db || null,
  };

  log("VERDICT", "Resumen final", verdict);

  if (!verdict.healthEndpointDeployed) {
    console.log(
      "\n⚠️  /api/health da 404 → el deploy con el fix todavía no está live. Esperá o Redeploy.\n"
    );
  } else if (verdict.envFromHealth && !verdict.envFromHealth.hasAuthSecret) {
    console.log(
      "\n⚠️  BETTER_AUTH_SECRET NO está en Vercel. Corré: node scripts/verify-vercel-env.mjs --sync\n"
    );
  } else if (verdict.dbFromHealth && !verdict.dbFromHealth.ok) {
    console.log(
      "\n⚠️  Env puede estar OK pero la DB no responde desde Vercel:\n",
      verdict.dbFromHealth.error,
      "\n"
    );
  } else if (loginOk) {
    console.log("\n✅ Login OK en producción.\n");
  }

  process.exit(loginOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
