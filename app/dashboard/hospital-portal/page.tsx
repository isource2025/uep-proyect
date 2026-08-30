import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { serializeData } from "@/lib/utils";
import HospitalPortalClient from "./hospital-portal-client";

export const revalidate = 0;

export default async function HospitalPortalPage() {
  // 1. Get authenticated user session
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user as any;
  if (!session || !user?.hospitalId) {
    redirect("/dashboard");
  }

  const hospitalId = user.hospitalId;

  // 2. Fetch the hospital/proveedor info
  const hospital = await prisma.proveedor.findUnique({
    where: { id: hospitalId },
  });

  if (!hospital) {
    redirect("/dashboard");
  }

  // 3. Find liquidations and agents that belong to this hospital in parallel
  const [hospitalLiquidations, agents] = await Promise.all([
    prisma.liquidacion.findMany({
      where: {
        details: {
          some: {
            OR: [
              { hospitalId: hospitalId },
              { compra: { hospitalId: hospitalId } },
              ...(hospital.nombre ? [{ prestadorNombre: { contains: hospital.nombre } }] : []),
            ],
          },
        },
      },
      include: {
        period: true,
        rc: {
          include: {
            cliente: true,
          },
        },
        details: {
          include: {
            hospital: true,
            compra: true,
          },
        },
        distributions: {
          include: {
            agent: true,
          },
        },
        attachments: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agente.findMany({
      where: { hospitalId },
      orderBy: { nombre: "asc" },
    }),
  ]);

  // Server Action to add an attachment
  const handleAddAttachment = async (formData: FormData) => {
    "use server";
    const liquidationIdStr = formData.get("liquidationId") as string;
    const fileName = formData.get("fileName") as string;
    const fileUrl = formData.get("fileUrl") as string;

    if (!liquidationIdStr || !fileName || !fileUrl) return;
    const liquidationId = parseInt(liquidationIdStr, 10);

    try {
      await prisma.adjunto.create({
        data: {
          liquidationId,
          fileName,
          fileUrl,
        },
      });
      revalidatePath("/dashboard/hospital-portal");
    } catch (e) {
      console.error("Error creating attachment:", e);
    }
  };

  return (
    <HospitalPortalClient
      hospital={serializeData(hospital)}
      hospitalId={hospitalId}
      initialLiquidations={serializeData(hospitalLiquidations)}
      agents={serializeData(agents)}
      onAddAttachment={handleAddAttachment}
    />
  );
}
