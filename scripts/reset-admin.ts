import "dotenv/config";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";

async function main() {
  const authContext = await auth.$context;
  const hashedPassword = await authContext.password.hash("admin123");

  const user = await prisma.user.findUnique({
    where: { email: "admin@uep.gov.ar" },
  });

  if (!user) {
    console.error("User admin@uep.gov.ar not found");
    process.exit(1);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      emailVerified: true,
      role: "1",
    },
  });

  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });

  if (account) {
    await prisma.account.update({
      where: { id: account.id },
      data: { password: hashedPassword },
    });
  } else {
    await prisma.account.create({
      data: {
        id: "admin-account-id",
        accountId: "admin@uep.gov.ar",
        providerId: "credential",
        userId: user.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  console.log("Admin password reset to admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
