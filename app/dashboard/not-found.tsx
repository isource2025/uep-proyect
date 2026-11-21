import { NotFoundView } from "@/components/not-found-view";

export default function DashboardNotFound() {
  return (
    <NotFoundView
      embedded={true}
      title="Recurso no encontrado"
      description="La liquidación, comprobante o sección solicitada no existe o no se encuentra disponible."
      primaryHref="/dashboard"
      primaryLabel="Volver al panel principal"
    />
  );
}
