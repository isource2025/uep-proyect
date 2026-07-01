import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { appUrl, authSecret, trustedOrigins } from "./auth-config";
import { prisma } from "./prisma";

export const auth = betterAuth({
  secret: authSecret,
  baseURL: appUrl,
  trustedOrigins,
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
        defaultValue: "OPERATOR",
      },
      hospitalId: {
        type: "number",
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
