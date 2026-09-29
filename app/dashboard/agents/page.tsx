import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeData } from "@/lib/utils";
import { isUserAdmin, isUserHospital } from "@/lib/constants";
import { fetchAgentsData } from "./actions";
import AgentsClient from "./agents-client";

export const revalidate = 0;

export default async function AgentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const user = session.user as any;
  const isAdmin = isUserAdmin(user.role);
  const isHospital = isUserHospital(user.role, user.hospitalId);

  // Non-admins and non-hospitals (e.g. Liquidadores) are forbidden from the agents panel
  if (!isAdmin && !isHospital) {
    redirect("/dashboard");
  }

  const isHospitalUser = !isAdmin;

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
      const empresa = await prisma.empresa.findUnique({
        where: { id: hospId },
      });
      if (empresa) {
        targetEmpresaId = empresa.id;
      } else {
        targetEmpresaId = hospId;
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
