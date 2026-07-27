import { PrismaClient } from "./generated/prisma";
import { PrismaMssql } from "@prisma/adapter-mssql";

// Cache PrismaClient in development mode (touch for schema reloads)
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function parseSqlServerUrl(url: string) {
  const cleanUrl = url.replace("sqlserver://", "");
  const parts = cleanUrl.split(";");
  const hostPort = parts[0];
  const [server, portStr] = hostPort.split(":");
  const port = portStr ? parseInt(portStr, 10) : 1433;

  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const [key, val] = parts[i].split("=");
    if (key && val) {
      params[key.trim()] = val.trim();
    }
  }

  return { server, port, params };
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  // Strip accidental quotes if the value was pasted with quotes in Vercel
  const cleaned = url.trim().replace(/^["']|["']$/g, "");
  const { server, port, params } = parseSqlServerUrl(cleaned);

  const encryptRaw = (params.encrypt || "false").toLowerCase();
  const trustRaw = (params.trustServerCertificate || "true").toLowerCase();

  const adapter = new PrismaMssql({
    server,
    port,
    database: params.database || "UEP",
    user: params.user || "sa",
    password: params.password || "",
    options: {
      encrypt: encryptRaw === "true",
      trustServerCertificate: trustRaw === "true" || trustRaw === "1",
    },
  });

  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const client = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
