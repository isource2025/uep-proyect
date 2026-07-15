import "dotenv/config";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";

const ADMIN_EMAIL = "admin@uep.gov.ar";
const ADMIN_PASSWORD = "admin123";
const ADMIN_NAME = "Admin UEP";
const ADMIN_ROLE = "1"; // ADMIN in imRoles
const ADMIN_OPERADOR = "admin";

async function main() {
  console.log("Connecting to:", process.env.DATABASE_URL?.replace(/password=[^;]+/i, "password=***"));

  const authContext = await auth.$context;
  const hashedPassword = await authContext.password.hash(ADMIN_PASSWORD);

  let user = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL },
  });

  if (user) {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        name: ADMIN_NAME,
        role: ADMIN_ROLE,
        operador: ADMIN_OPERADOR,
        emailVerified: true,
        hospitalId: null,
      },
    });
    console.log(`Updated existing user id=${user.id}`);
  } else {
    const maxUser = await prisma.user.findFirst({ orderBy: { id: "desc" } });
    const nextId = Math.max(10000, (maxUser?.id || 0) + 1);

    user = await prisma.user.create({
      data: {
        id: nextId,
        email: ADMIN_EMAIL,
        password: hashedPassword,
        name: ADMIN_NAME,
        role: ADMIN_ROLE,
        operador: ADMIN_OPERADOR,
        matricula: nextId,
        emailVerified: true,
        hospitalId: null,
      },
    });
    console.log(`Created new user id=${user.id}`);
  }

  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: {
        password: hashedPassword,
        accountId: ADMIN_EMAIL,
        updatedAt: new Date(),
      },
    });
    console.log("Updated credential Account");
  } else {
    await prisma.account.create({
      data: {
        id: `admin-account-${user.id}`,
        accountId: ADMIN_EMAIL,
        providerId: "credential",
        userId: user.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log("Created credential Account");
  }

  console.log("\nAdmin listo:");
  console.log(`  Email:    ${ADMIN_EMAIL}`);
  console.log(`  Password: ${ADMIN_PASSWORD}`);
  console.log(`  Role:     ${ADMIN_ROLE} (ADMIN)`);
}

main()
  .catch((e) => {
    console.error("Error ensuring admin:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
