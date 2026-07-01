import { PrismaClient } from "./generated/prisma";
import { PrismaMssql } from "@prisma/adapter-mssql";

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

  const { server, port, params } = parseSqlServerUrl(url);

  const adapter = new PrismaMssql({
    server,
    port,
    database: params.database || "iSource",
    user: params.user || "sa",
    password: params.password || "isource",
    options: {
      encrypt: params.encrypt === "true" || params.encrypt === undefined,
      trustServerCertificate:
        params.trustServerCertificate === "true" ||
        params.trustServerCertificate === undefined,
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
