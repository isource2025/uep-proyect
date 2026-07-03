import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getAppUrl, authSecret, getTrustedOrigins } from "./auth-config";
import { prisma } from "./prisma";

export const auth = betterAuth({
  secret: authSecret,
  baseURL: getAppUrl(),
  trustedOrigins: getTrustedOrigins(),
  database: prismaAdapter(prisma, {
    provider: "sqlserver",
  }),
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        defaultValue: "4",
      },
      hospitalId: {
        type: "number",
        required: false,
      },
      operador: {
        type: "string",
        required: false,
      },
    },
  },
  advanced: {
    database: {
      generateId: "serial",
    },
  },
});
