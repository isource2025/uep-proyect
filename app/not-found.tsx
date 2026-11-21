import { NotFoundView } from "@/components/not-found-view";

export default function NotFound() {
  return (
    <NotFoundView
      embedded={false}
      title="Página no encontrada"
      description="La dirección a la que intentaste acceder no existe, fue eliminada o ya no se encuentra disponible en el sistema UEP."
      primaryHref="/dashboard"
      primaryLabel="Ir al panel principal"
    />
  );
}
