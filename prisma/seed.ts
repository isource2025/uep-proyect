import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { auth } from "../lib/auth";

const adapter = new PrismaMariaDb({
  user: "facundofernandez",
  database: "uep-proyect",
  socketPath: "/tmp/mysql.sock",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Starting seeding...");
  
  const authContext = await auth.$context;
  const hashedPassword = await authContext.password.hash("admin123");

  // 1. Clean existing data
  await prisma.distribution.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.liquidationDetail.deleteMany();
  await prisma.liquidation.deleteMany();
  await prisma.compra.deleteMany();
  await prisma.cbteAplica.deleteMany();
  await prisma.cbte.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.proveedor.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.period.deleteMany();
  await prisma.systemConfig.deleteMany();

  console.log("Database cleared.");

  // 2. Create Hospitals
  const hospitalVidal = await prisma.hospital.create({
    data: { name: "Hospital Vidal", code: "HOSP_VIDAL" },
  });
  const hospitalEscuela = await prisma.hospital.create({
    data: { name: "Hospital Escuela", code: "HOSP_ESCUELA" },
  });
  const hospitalSanJose = await prisma.hospital.create({
    data: { name: "Hospital San José", code: "HOSP_SAN_JOSE" },
  });
  console.log("Hospitals created.");

  // 3. Create Admin User (password is 'admin123', using bcrypt hash compatible with better-auth)
  const adminUser = await prisma.user.create({
    data: {
      name: "Administrador UEP",
      email: "admin@uep.gov.ar",
      emailVerified: true,
      role: "ADMIN",
    },
  });

  // Link account with credentials
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
  console.log("Admin user seeded.");

  // 4. Create Active Period
  const currentPeriod = await prisma.period.create({
    data: {
      name: "Junio 2026",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-06-30"),
      status: "OPEN",
    },
  });
  console.log("Period seeded.");

  // 5. Create ERP Clients (Obras Sociales)
  const osde = await prisma.cliente.create({
    data: { nombre: "OSDE", cuit: "30-54637281-9" },
  });
  const iose = await prisma.cliente.create({
    data: { nombre: "IOSCOR", cuit: "30-61273849-5" },
  });
  console.log("ERP Clients seeded.");

  // 6. Create ERP Providers (Hospitals as Providers in ERP)
  await prisma.proveedor.createMany({
    data: [
      { nombre: "HOSPITAL J. R. VIDAL", cuit: "30-99900011-1", code: "HOSP_VIDAL" },
      { nombre: "HOSPITAL ESCUELA J. F. CABRAL", cuit: "30-99900022-2", code: "HOSP_ESCUELA" },
      { nombre: "HOSPITAL DE SAN JOSE", cuit: "30-99900033-3", code: "HOSP_SAN_JOSE" },
    ],
  });
  console.log("ERP Providers seeded.");

  // 7. Create ERP Invoices & Receipts (CBTES)
  // Let's create sales invoices (FC) and a receipt (RC)
  const fc1 = await prisma.cbte.create({
    data: {
      type: "FC",
      puntoVenta: "0001",
      numero: "00001234",
      fecha: new Date("2026-06-10"),
      importe: 150000.00,
      clienteId: osde.id,
      hospitalCode: "HOSP_VIDAL", // Vidal hospital
    },
  });

  const fc2 = await prisma.cbte.create({
    data: {
      type: "FC",
      puntoVenta: "0001",
      numero: "00001235",
      fecha: new Date("2026-06-12"),
      importe: 250000.00,
      clienteId: osde.id,
      hospitalCode: "HOSP_ESCUELA", // Escuela hospital
    },
  });

  const fc3 = await prisma.cbte.create({
    data: {
      type: "FC",
      puntoVenta: "0001",
      numero: "00001236",
      fecha: new Date("2026-06-15"),
      importe: 100000.00,
      clienteId: iose.id,
      hospitalCode: "HOSP_SAN_JOSE", // San Jose hospital
    },
  });

  // Receipts (RC)
  const rc1 = await prisma.cbte.create({
    data: {
      type: "RC",
      puntoVenta: "0001",
      numero: "00000555",
      fecha: new Date("2026-06-25"),
      importe: 400000.00, // Pays both fc1 and fc2
      clienteId: osde.id,
    },
  });
  console.log("ERP CBTES seeded.");

  // 8. Create CBTES_APLICA (linking RC to FCs)
  await prisma.cbteAplica.createMany({
    data: [
      { rcId: rc1.id, fcId: fc1.id, importe: 150000.00 },
      { rcId: rc1.id, fcId: fc2.id, importe: 250000.00 },
    ],
  });
  console.log("ERP CBTES_APLICA relations seeded.");

  // 9. Create ERP Purchases (COMPRAS) - Hospitals issuing invoices to UEP
  await prisma.compra.createMany({
    data: [
      {
        numero: "0002-00004561",
        fecha: new Date("2026-06-18"),
        importe: 120000.00, // Vidal purchase invoice
        hospitalId: hospitalVidal.id,
        fcVentaId: fc1.id,
      },
      {
        numero: "0005-00008273",
        fecha: new Date("2026-06-19"),
        importe: 210000.00, // Escuela purchase invoice
        hospitalId: hospitalEscuela.id,
        fcVentaId: fc2.id,
      },
    ],
  });
  console.log("ERP Purchases seeded.");

  // 10. Create SISPER Agents
  await prisma.agent.createMany({
    data: [
      // Vidal Agents
      {
        dni: "20.123.456",
        cuil: "20-20123456-9",
        nombre: "Dr. Juan Pérez",
        cargo: "Médico de Guardia",
        establecimiento: "HOSPITAL VIDAL",
        hospitalId: hospitalVidal.id,
      },
      {
        dni: "27.234.567",
        cuil: "27-27234567-4",
        nombre: "Dra. María González",
        cargo: "Jefa de Pediatría",
        establecimiento: "HOSPITAL VIDAL",
        hospitalId: hospitalVidal.id,
      },
      // Escuela Agents
      {
        dni: "20.345.678",
        cuil: "20-20345678-2",
        nombre: "Dr. Carlos Rodríguez",
        cargo: "Cirujano General",
        establecimiento: "HOSPITAL ESCUELA",
        hospitalId: hospitalEscuela.id,
      },
      {
        dni: "27.456.789",
        cuil: "27-27456789-9",
        nombre: "Lic. Ana Martínez",
        cargo: "Enfermera Jefa",
        establecimiento: "HOSPITAL ESCUELA",
        hospitalId: hospitalEscuela.id,
      },
      // San Jose Agents
      {
        dni: "20.567.890",
        cuil: "20-20567890-5",
        nombre: "Dr. Luis Silva",
        cargo: "Cardiólogo",
        establecimiento: "HOSPITAL SAN JOSE",
        hospitalId: hospitalSanJose.id,
      },
    ],
  });
  console.log("SISPER Agents seeded.");

  // 11. Create System Configs
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
