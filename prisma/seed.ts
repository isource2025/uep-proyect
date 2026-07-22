import "dotenv/config";
import { prisma } from "../lib/prisma";
import { auth } from "../lib/auth";

async function main() {
  console.log("Starting non-destructive seeding on SQL Server...");
  
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword) {
    throw new Error("❌ SEED_ADMIN_PASSWORD environment variable is not defined in .env!");
  }
  
  const authContext = await auth.$context;
  const hashedPassword = await authContext.password.hash(seedPassword);

  // 1. Ensure we have at least some Providers (Hospitals)
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

  // 2. Ensure we have the Admin User in imPersonal table
  let adminUser = await prisma.user.findFirst({
    where: { email: "admin@uep.gov.ar" }
  });

  if (!adminUser) {
    const maxUser = await prisma.user.findFirst({
      orderBy: { id: "desc" }
    });
    const nextId = Math.max(10000, (maxUser?.id || 0) + 1);

    adminUser = await prisma.user.create({
      data: {
        id: nextId,
        email: "admin@uep.gov.ar",
        password: hashedPassword,
        name: "Admin UEP",
        role: "1", // ADMIN role in imRoles
        operador: "admin",
        matricula: nextId,
        emailVerified: true,
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
  let medicenterUser = await prisma.user.findFirst({
    where: { email: "admin@medicenter.com" }
  });
  if (!medicenterUser) {
    const maxUser = await prisma.user.findFirst({
      orderBy: { id: "desc" }
    });
    const nextId = Math.max(10000, (maxUser?.id || 0) + 1);

    medicenterUser = await prisma.user.create({
      data: {
        id: nextId,
        email: "admin@medicenter.com",
        password: hashedPassword,
        name: "Admin Medicenter",
        role: "1", // ADMIN role
        operador: "admin_medi",
        matricula: nextId,
        emailVerified: true,
        hospitalId: prov1.id,
      }
    });
    console.log("Admin user admin@medicenter.com created in imPersonal.");
  }

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
        password: medicenterUser.password || hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    });
    console.log("Linked credentials account for admin@medicenter.com.");
  }

  // 3. Ensure we have an active period in Periodos_IVA (e.g. June 2026)
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

  // 4. Create SISPER Agents by inserting directly into imPersonal (User model)
  const agentsData = [
    {
      id: 201,
      cuil: "20-20123456-9",
      nombre: "Dr. Juan Pérez",
      cargo: "2", // MEDICO role
      hospitalId: prov1.id,
    },
    {
      id: 202,
      cuil: "27-27234567-4",
      nombre: "Dra. María González",
      cargo: "2", // MEDICO role
      hospitalId: prov1.id,
    },
    {
      id: 203,
      cuil: "20-20345678-2",
      nombre: "Dr. Carlos Rodríguez",
      cargo: "2", // MEDICO role
      hospitalId: prov2.id,
    },
    {
      id: 204,
      cuil: "27-27456789-9",
      nombre: "Lic. Ana Martínez",
      cargo: "3", // ENFERMERO role
      hospitalId: prov2.id,
    },
    {
      id: 205,
      cuil: "20-20567890-5",
      nombre: "Dr. Luis Silva",
      cargo: "2", // MEDICO role
      hospitalId: prov3.id,
    },
  ];

  for (const ag of agentsData) {
    const existing = await prisma.agente.findFirst({
      where: { cuil: ag.cuil }
    });
    if (!existing) {
      await prisma.agente.create({
        data: {
          cuil: ag.cuil,
          nombre: ag.nombre,
          cargo: ag.cargo,
          hospitalId: ag.hospitalId,
          establecimiento: "Establecimiento Test",
        }
      });
    }
  }
  console.log("SISPER Agents seeded in imPersonal.");

  // Ensure we have at least one system parameter in CParametros
  const paramCount = await prisma.cParametro.count();
  if (paramCount === 0) {
    await prisma.cParametro.create({
      data: {
        id: "UEP_CONFIG_GEN",
        descripcion: "Configuración General Portal",
        idEmpresa: 1,
        idSucursal: 1,
        idCentroCosto: 101,
        idCuenta: 1110101,
        ejercicio: 2026,
        observaciones: "Configuración global inicial del portal UEP.",
      }
    });
    console.log("Mock CParametro seeded.");
  }

  console.log("Seeding completed successfully without deleting any existing data!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
