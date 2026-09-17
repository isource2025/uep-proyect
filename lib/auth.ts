import { betterAuth, APIError } from "better-auth";
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
      estado: {
        type: "number",
        defaultValue: 1,
        required: false,
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const userIdNum = typeof session.userId === "number" ? session.userId : parseInt(session.userId, 10);
          const user = await prisma.user.findUnique({
            where: { id: userIdNum },
          });
          if (user && user.estado === 0) {
            throw new APIError("FORBIDDEN", {
              message: "Su usuario se encuentra inactivo. Comuníquese con el administrador del sistema.",
            });
          }
        },
      },
    },
  },
  advanced: {
    database: {
      generateId: "serial",
    },
  },
});
