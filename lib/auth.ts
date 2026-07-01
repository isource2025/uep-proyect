import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : undefined,
  database: prismaAdapter(prisma, {
    provider: "sqlserver",
  }),
  emailAndPassword: {
    enabled: true,
  },
  // You can extend the schema fields or add custom options here
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
