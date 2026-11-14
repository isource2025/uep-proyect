import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { serializeData } from "@/lib/utils";
import { isUserAdmin, isUserHospital } from "@/lib/constants";
import { resolveUserEmpresaId } from "@/lib/hospital-resolver";
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
    // EMPRESA del usuario: imPersonalEmpresas, o imPersonal.hospitalId (IDPROVEEDOR) -> EMPRESA validada por CUIT
    targetEmpresaId = await resolveUserEmpresaId(user);
    if (!targetEmpresaId) {
      // Fail-closed: un hospital sin efector resuelto no puede ver la nómina de todos los establecimientos
      redirect("/dashboard/hospital-portal");
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
