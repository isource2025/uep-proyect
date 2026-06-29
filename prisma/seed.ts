import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";

async function main() {
  console.log("Starting seeding on SQL Server...");
  
  const authContext = await auth.$context;
  const hashedPassword = await authContext.password.hash("admin123");

  // 1. Clean existing custom portal data
  await prisma.distribution.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.liquidationDetail.deleteMany();
  await prisma.liquidation.deleteMany();
  
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.systemConfig.deleteMany();

  console.log("Custom portal tables cleared.");

  // 2. Ensure we have at least some Providers (Hospitals)
  let providers = await prisma.proveedor.findMany({ take: 3 });
  if (providers.length === 0) {
    console.log("No providers found in PROVEEDORES, creating mock ones...");
    await prisma.proveedor.createMany({
      data: [
        { id: 1, nombre: "HOSPITAL VIDAL", code: "HOSP_VIDAL", cuit: 30123456789 },
        { id: 2, nombre: "HOSPITAL ESCUELA", code: "HOSP_ESCUELA", cuit: 30234567891 },
        { id: 3, nombre: "HOSPITAL SAN JOSE", code: "HOSP_SAN_JOSE", cuit: 30345678912 },
      ]
    });
    providers = await prisma.proveedor.findMany({ take: 3 });
  }

  const prov1 = providers[0];
  const prov2 = providers[1] || prov1;
  const prov3 = providers[2] || prov1;

  // 3. Ensure we have the Admin User in Users table
  let adminUser = await prisma.user.findUnique({
    where: { email: "admin@uep.gov.ar" }
  });

  if (!adminUser) {
    adminUser = await prisma.user.create({
      data: {
        email: "admin@uep.gov.ar",
        password: hashedPassword,
        firstName: "Admin",
        lastName: "UEP",
        dni: "00000001",
        isAdmin: true,
        emailVerified: true,
        role: "ADMIN",
        hospitalId: prov1.id,
      },
    });

    // Link account with credentials for better-auth
    await prisma.account.create({
      data: {
        id: "admin-account-id",
        accountId: "admin@uep.gov.ar",
        providerId: "credential",
        userId: adminUser.id,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    console.log("Admin user admin@uep.gov.ar seeded.");
  } else {
    console.log("Admin user admin@uep.gov.ar already exists.");
  }

  // Also ensure the existing admin@medicenter.com has an account link if needed
  const medicenterUser = await prisma.user.findUnique({
    where: { email: "admin@medicenter.com" }
  });
  if (medicenterUser) {
    const accountExists = await prisma.account.findFirst({
      where: { userId: medicenterUser.id }
    });
    if (!accountExists) {
      await prisma.account.create({
        data: {
          id: "medicenter-account-id",
          accountId: "admin@medicenter.com",
          providerId: "credential",
          userId: medicenterUser.id,
          password: medicenterUser.password, // Keep the bcrypt hash already in table
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      });
      console.log("Linked credentials account for admin@medicenter.com.");
    }
  }

  // 4. Ensure we have an active period in Periodos_IVA (e.g. June 2026)
  let activePeriod = await prisma.periodoIVA.findFirst({
    where: { anio: 2026, mes: 6, iva: "V" }
  });

  if (!activePeriod) {
    activePeriod = await prisma.periodoIVA.create({
      data: {
        anio: 2026,
        mes: 6,
        iva: "V",
        fechaAlta: new Date(),
      }
    });
    console.log("Period 2026/06 Ventas created.");
  } else {
    // If it exists, ensure it is open (fechaCierre is null)
    await prisma.periodoIVA.update({
      where: { anio_mes_iva: { anio: 2026, mes: 6, iva: "V" } },
      data: { fechaCierre: null }
    });
    console.log("Period 2026/06 Ventas ensured open.");
  }

  // 5. Create SISPER Agents linking to our providers
  await prisma.agent.createMany({
    data: [
      {
        dni: "20.123.456",
        cuil: "20-20123456-9",
        nombre: "Dr. Juan Pérez",
        cargo: "Médico de Guardia",
        establecimiento: prov1.nombre || "HOSPITAL VIDAL",
        hospitalId: prov1.id,
      },
      {
        dni: "27.234.567",
        cuil: "27-27234567-4",
        nombre: "Dra. María González",
        cargo: "Jefa de Pediatría",
        establecimiento: prov1.nombre || "HOSPITAL VIDAL",
        hospitalId: prov1.id,
      },
      {
        dni: "20.345.678",
        cuil: "20-20345678-2",
        nombre: "Dr. Carlos Rodríguez",
        cargo: "Cirujano General",
        establecimiento: prov2.nombre || "HOSPITAL ESCUELA",
        hospitalId: prov2.id,
      },
      {
        dni: "27.456.789",
        cuil: "27-27456789-9",
        nombre: "Lic. Ana Martínez",
        cargo: "Enfermera Jefa",
        establecimiento: prov2.nombre || "HOSPITAL ESCUELA",
        hospitalId: prov2.id,
      },
      {
        dni: "20.567.890",
        cuil: "20-20567890-5",
        nombre: "Dr. Luis Silva",
        cargo: "Cardiólogo",
        establecimiento: prov3.nombre || "HOSPITAL SAN JOSE",
        hospitalId: prov3.id,
      },
    ],
  });
  console.log("SISPER Agents seeded.");

  // 6. Create System Configs
  await prisma.systemConfig.createMany({
    data: [
      { key: "system_name", value: "Unidad Ejecutora Provincial (UEP)" },
      { key: "tax_id", value: "30-71112223-4" },
    ],
  });
  console.log("System configs seeded.");

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
