import { PrismaClient } from "./generated/prisma";
import { PrismaMssql } from "@prisma/adapter-mssql";

// LOCAL MariaDB Connection setup (commented out)
// import { PrismaMariaDb } from "@prisma/adapter-mariadb";
// const adapter = new PrismaMariaDb({
//   user: "facundofernandez",
//   database: "uep-proyect",
//   socketPath: "/tmp/mysql.sock",
// });

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

let prismaInstance: PrismaClient;

if (globalForPrisma.prisma) {
  prismaInstance = globalForPrisma.prisma;
} else {
  const url = process.env.DATABASE_URL || "sqlserver://181.4.71.230:1433;database=iSource;user=sa;password=isource;encrypt=false;trustServerCertificate=true";
  
  // Parse SQL Server connection string
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

  const adapter = new PrismaMssql({
    server,
    port,
    database: params.database || "iSource",
    user: params.user || "sa",
    password: params.password || "isource",
    options: {
      encrypt: params.encrypt === "true" || params.encrypt === undefined, // default behavior or explicitly true
      trustServerCertificate: params.trustServerCertificate === "true" || params.trustServerCertificate === undefined,
    }
  });

  prismaInstance = new PrismaClient({ adapter });
}

export const prisma = prismaInstance;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
