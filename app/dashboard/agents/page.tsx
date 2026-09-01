import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
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
  const isHospitalUser = user.role !== "1" && user.hospitalId !== undefined && user.hospitalId !== null;
  const targetHospitalId = isHospitalUser ? user.hospitalId : undefined;

  const initialData = await fetchAgentsData(undefined, targetHospitalId);

  return (
    <AgentsClient
      initialData={serializeData(initialData)}
      currentUser={session.user as any}
    />
  );
}
