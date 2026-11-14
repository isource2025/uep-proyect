"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { isUserAdmin } from "@/lib/constants";
import { UEP_EMPRESA_ID } from "@/lib/hospital-resolver";

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

    const { descripcion, localidad, cuit, email } = parsed.data;

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

    const { descripcion, localidad, cuit, email } = parsed.data;

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
    return { success: true };
  } catch (e: any) {
    console.error("Error updating hospital in EMPRESAS:", e);
    return { error: e.message || "Error al actualizar el establecimiento en EMPRESAS." };
  }
}
