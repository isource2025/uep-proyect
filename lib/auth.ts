import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "mysql",
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
        type: "string",
        required: false,
      },
    },
  },
});
