"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isUserAdmin } from "@/lib/constants";
import { cleanCuit, formatCuit } from "@/lib/hospital-mapping";
import { UEP_EMPRESA_ID } from "@/lib/hospital-resolver";

async function findProveedorByNormalizedCuit(digitsCuit: string) {
  if (!digitsCuit || digitsCuit.length !== 11) return null;
  const numericCuit = Number(digitsCuit);
  if (!Number.isSafeInteger(numericCuit)) return null;

  const directMatch = await prisma.proveedor.findFirst({
    where: { cuit: numericCuit },
    select: { id: true, nombre: true, cuit: true },
    orderBy: { id: "asc" },
  });

  if (directMatch && cleanCuit(directMatch.cuit) === digitsCuit) {
    return directMatch;
  }

  const allProveedores = await prisma.proveedor.findMany({
    where: { cuit: { not: null } },
    select: { id: true, nombre: true, cuit: true },
    orderBy: { id: "asc" },
  });

  return allProveedores.find((p) => cleanCuit(p.cuit) === digitsCuit) || null;
}

function validateHospitalFormData(formData: FormData) {
  const rawName = (formData.get("name") as string) || "";
  const rawLocalidad = (formData.get("localidad") as string) || "";
  const rawCuit = (formData.get("cuit") as string) || "";
  const rawEmail = (formData.get("email") as string) || "";

  const name = rawName.trim().toUpperCase();
  const localidad = rawLocalidad.trim().toUpperCase();
  const digitsCuit = rawCuit.replace(/[^\d]/g, "");
  const email = rawEmail.trim().toLowerCase();

  if (!name) {
    return { error: "El nombre o razón social es obligatorio." };
  }
  if (name.length > 80) {
    return { error: "El nombre no puede superar los 80 caracteres." };
  }
  if (!localidad) {
    return { error: "La localidad es obligatoria." };
  }
  if (localidad.length > 30) {
    return { error: "La localidad no puede superar los 30 caracteres." };
  }
  if (!digitsCuit || digitsCuit.length !== 11) {
    return { error: "El CUIT es obligatorio y debe contener exactamente 11 dígitos numéricos." };
  }
  if (!email) {
    return { error: "El correo corporativo es obligatorio." };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: "El formato del correo corporativo no es válido." };
  }
  if (email.length > 40) {
    return { error: "El correo corporativo en EMPRESAS admite un máximo de 40 caracteres." };
  }

  return {
    data: {
      descripcion: name,
      localidad,
      cuit: Number(digitsCuit),
      digitsCuit,
      email,
    },
  };
}

export async function createHospitalAction(formData: FormData) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !isUserAdmin((session.user as any).role)) {
      return { error: "Acceso denegado. Solo los administradores pueden crear establecimientos." };
    }

    const parsed = validateHospitalFormData(formData);
    if (parsed.error || !parsed.data) {
      return { error: parsed.error || "Datos inválidos." };
    }

    const { descripcion, localidad, cuit, digitsCuit, email } = parsed.data;

    // Regla obligatoria: el CUIT debe existir previamente en PROVEEDORES (ERP)
    const matchingProveedor = await findProveedorByNormalizedCuit(digitsCuit);
    if (!matchingProveedor) {
      return {
        error: `El CUIT ${formatCuit(digitsCuit)} no figura en PROVEEDORES (ERP). El efector debe existir previamente en PROVEEDORES con exactamente el mismo CUIT para poder registrarlo.`,
      };
    }

    await prisma.$transaction(async (tx) => {
      const maxId = await tx.empresa.aggregate({
        _max: { id: true },
      });
      const nextId = Math.max((maxId._max.id || 0) + 1, UEP_EMPRESA_ID + 1);

      await tx.empresa.create({
        data: {
          id: nextId,
          descripcion,
          localidad,
          cuit,
          email,
          activo: true,
        },
      });
    });

    revalidatePath("/dashboard/hospitals");
    revalidatePath("/dashboard/users");
    return { success: true };
  } catch (e: any) {
    console.error("Error creating hospital in EMPRESAS:", e);
    return { error: e.message || "Error al registrar el establecimiento en EMPRESAS." };
  }
}

export async function updateHospitalAction(formData: FormData) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !isUserAdmin((session.user as any).role)) {
      return { error: "Acceso denegado. Solo los administradores pueden editar establecimientos." };
    }

    const hospitalIdRaw = formData.get("hospitalId") as string;
    const hospitalId = parseInt(hospitalIdRaw, 10);
    if (!Number.isFinite(hospitalId) || hospitalId <= 0 || hospitalId === UEP_EMPRESA_ID) {
      return { error: "Establecimiento inválido para edición." };
    }

    const parsed = validateHospitalFormData(formData);
    if (parsed.error || !parsed.data) {
      return { error: parsed.error || "Datos inválidos." };
    }

    const { descripcion, localidad, cuit, digitsCuit, email } = parsed.data;

    // Regla obligatoria: el CUIT debe coincidir con un registro existente en PROVEEDORES (ERP)
    const matchingProveedor = await findProveedorByNormalizedCuit(digitsCuit);
    if (!matchingProveedor) {
      return {
        error: `El CUIT ${formatCuit(digitsCuit)} no figura en PROVEEDORES (ERP). Debe coincidir exactamente con un proveedor cargado en el ERP para guardar los cambios.`,
      };
    }

    const existing = await prisma.empresa.findUnique({
      where: { id: hospitalId },
      select: { id: true },
    });
    if (!existing) {
      return { error: "El establecimiento seleccionado no existe en EMPRESAS." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.empresa.update({
        where: { id: hospitalId },
        data: {
          descripcion,
          localidad,
          cuit,
          email,
        },
      });
    });

    revalidatePath("/dashboard/hospitals");
    revalidatePath("/dashboard/users");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e: any) {
    console.error("Error updating hospital in EMPRESAS:", e);
    return { error: e.message || "Error al actualizar el establecimiento en EMPRESAS." };
  }
}

export async function toggleHospitalStatusAction(hospitalId: number, nextActive: boolean) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user || !isUserAdmin((session.user as any).role)) {
      return {
        error: "Acceso denegado. Solo los administradores pueden cambiar el estado de establecimientos.",
      };
    }

    if (!Number.isFinite(hospitalId) || hospitalId <= 0 || hospitalId === UEP_EMPRESA_ID) {
      return { error: "Establecimiento inválido para cambio de estado." };
    }

    const existing = await prisma.empresa.findUnique({
      where: { id: hospitalId },
      select: { id: true, descripcion: true, activo: true },
    });
    if (!existing) {
      return { error: "El establecimiento seleccionado no existe en EMPRESAS." };
    }

    await prisma.$transaction(async (tx) => {
      await tx.empresa.update({
        where: { id: hospitalId },
        data: { activo: Boolean(nextActive) },
      });
    });

    revalidatePath("/dashboard/hospitals");
    revalidatePath("/dashboard/users");
    revalidatePath("/dashboard");
    return { success: true };
  } catch (e: any) {
    console.error("Error toggling hospital status in EMPRESAS:", e);
    return { error: e.message || "Error al actualizar el estado del establecimiento." };
  }
}
