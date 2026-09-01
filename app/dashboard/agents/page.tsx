import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeData } from "@/lib/utils";
import { fetchAgentsData } from "./actions";
import AgentsClient from "./agents-client";

export const revalidate = 0;

export default async function AgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;
  const isHospitalUser = user.role !== "1";

  let targetEmpresaId: number | undefined = undefined;

  if (isHospitalUser) {
    const personalId = parseInt(String(user.id), 10);
    const hospId = user.hospitalId ? parseInt(String(user.hospitalId), 10) : undefined;

    // 1. Check imPersonalEmpresas for this user
    if (!isNaN(personalId)) {
      const personalEmpresa = await prisma.imPersonalEmpresas.findFirst({
        where: { idPersonal: personalId },
      });
      if (personalEmpresa) {
        targetEmpresaId = personalEmpresa.idEmpresa;
      }
    }

    if (!targetEmpresaId && hospId && !isNaN(hospId)) {
      // 2. Check if user.hospitalId matches an EMPRESAS ID
      const empresa = await prisma.empresa.findUnique({
        where: { id: hospId },
      });
      if (empresa) {
        targetEmpresaId = empresa.id;
      } else {
        // 3. Match by name from Proveedor to EMPRESAS
        const prov = await prisma.proveedor.findUnique({
          where: { id: hospId },
          select: { nombre: true },
        });
        if (prov?.nombre) {
          const matched = await prisma.empresa.findFirst({
            where: {
              descripcion: {
                contains: prov.nombre.split("-")[0].trim(),
              },
            },
          });
          if (matched) targetEmpresaId = matched.id;
        }
      }
    }
  }

  const initialData = await fetchAgentsData(undefined, targetEmpresaId);

  return (
    <AgentsClient
      initialData={serializeData(initialData)}
      currentUser={serializeData({
        ...user,
        empresaId: targetEmpresaId,
      })}
      targetHospitalId={targetEmpresaId}
    />
  );
}
