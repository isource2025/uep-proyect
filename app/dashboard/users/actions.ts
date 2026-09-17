"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type UserActionResult = {
  success?: boolean;
  error?: string;
  fieldErrors?: {
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    role?: string;
    operador?: string;
    cuit?: string;
    hospitalId?: string;
  };
};

export type CreateUserResult = UserActionResult;

export async function createUserAction(formData: FormData): Promise<UserActionResult> {
  const name = (formData.get("name") as string || "").trim();
  const email = (formData.get("email") as string || "").trim();
  const password = (formData.get("password") as string || "");
  const confirmPassword = (formData.get("confirmPassword") as string || "");
  
  // Parse multi-role selection
  const rawRoles = formData.getAll("roles").map((r) => String(r).trim()).filter(Boolean);
  const rawRoleSingle = (formData.get("role") as string || "").trim();
  const allRoles = Array.from(
    new Set([
      ...rawRoles,
      ...(rawRoleSingle ? rawRoleSingle.split(",").map((r) => r.trim()).filter(Boolean) : []),
    ])
  );
  const role = allRoles.join(",");

  const cuit = (formData.get("cuit") as string || "").trim();
  const hospitalIdStr = (formData.get("hospitalId") as string || "").trim();
  const operador = (formData.get("operador") as string || "").trim();

  const fieldErrors: Record<string, string> = {};

  // 1. Validar Apellido y Nombre
  if (!name) {
    fieldErrors.name = "El Apellido y Nombre es obligatorio.";
  } else if (name.length < 3) {
    fieldErrors.name = "El Apellido y Nombre debe tener al menos 3 caracteres.";
  }

  // 2. Validar Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    fieldErrors.email = "El correo electrónico es obligatorio.";
  } else if (!emailRegex.test(email)) {
    fieldErrors.email = "Ingrese un formato de correo electrónico válido (ej. usuario@uep.gov.ar).";
  }

  // 3. Validar Contraseña y Confirmación
  if (!password) {
    fieldErrors.password = "La contraseña es obligatoria.";
  } else if (password.length < 6) {
    fieldErrors.password = "La contraseña debe tener al menos 6 caracteres.";
  }

  if (!confirmPassword) {
    fieldErrors.confirmPassword = "Debe repetir la contraseña.";
  } else if (password && confirmPassword && password !== confirmPassword) {
    fieldErrors.confirmPassword = "Las contraseñas no coinciden.";
  }

  // 4. Validar Rol
  if (!role || allRoles.length === 0) {
    fieldErrors.role = "Debe seleccionar al menos un rol para el operador.";
  }

  // 5. Validar Código de Operador
  if (operador && operador.length > 10) {
    fieldErrors.operador = "El código de operador no puede superar los 10 caracteres.";
  }

  // 6. Validar CUIT/CUIL
  if (cuit) {
    const cleanCuit = cuit.replace(/[^\d]/g, "");
    if (cleanCuit.length !== 11) {
      fieldErrors.cuit = "El CUIT/CUIL debe contener exactamente 11 dígitos numéricos.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Por favor complete o corrija los campos requeridos.",
      fieldErrors,
    };
  }

  const normalizedEmail = email.toLowerCase();

  try {
    // Check if a user with this email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      return {
        error: `Ya existe un usuario registrado con el correo electrónico "${normalizedEmail}".`,
        fieldErrors: {
          email: "Ya existe un usuario con este correo electrónico.",
        },
      };
    }

    const authContext = await auth.$context;
    const hashedPassword = await authContext.password.hash(password);

    await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: name.toUpperCase(),
          email: normalizedEmail,
          password: hashedPassword,
          role,
          operador: operador || normalizedEmail.split("@")[0].substring(0, 10),
          cuit: cuit ? cuit.replace(/[^\d]/g, "") : null,
          hospitalId: hospitalIdStr ? parseInt(hospitalIdStr, 10) : null,
          emailVerified: true,
          estado: 1, // Modo Activo
        },
      });

      await tx.account.create({
        data: {
          id: `account-${newUser.id}`,
          accountId: normalizedEmail,
          providerId: "credential",
          userId: newUser.id,
          password: hashedPassword,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
    });

    revalidatePath("/dashboard/users");
    return { success: true };
  } catch (e: any) {
    console.error("Error creating user in imPersonal:", e);
    if (
      e.code === "P2002" ||
      e.message?.includes("UNIQUE KEY") ||
      e.message?.includes("Unique constraint") ||
      e.message?.includes("email")
    ) {
      return {
        error: `Ya existe un usuario registrado con el correo electrónico "${normalizedEmail}".`,
        fieldErrors: {
          email: "Ya existe un usuario con este correo electrónico.",
        },
      };
    }
    return { error: e.message || "Error al crear el operador." };
  }
}

export async function updateUserAction(formData: FormData): Promise<UserActionResult> {
  const userIdStr = (formData.get("userId") as string || "").trim();
  const name = (formData.get("name") as string || "").trim();
  const email = (formData.get("email") as string || "").trim();
  const password = (formData.get("password") as string || "");
  const confirmPassword = (formData.get("confirmPassword") as string || "");

  // Parse multi-role selection
  const rawRoles = formData.getAll("roles").map((r) => String(r).trim()).filter(Boolean);
  const rawRoleSingle = (formData.get("role") as string || "").trim();
  const allRoles = Array.from(
    new Set([
      ...rawRoles,
      ...(rawRoleSingle ? rawRoleSingle.split(",").map((r) => r.trim()).filter(Boolean) : []),
    ])
  );
  const role = allRoles.join(",");

  const cuit = (formData.get("cuit") as string || "").trim();
  const hospitalIdStr = (formData.get("hospitalId") as string || "").trim();
  const operador = (formData.get("operador") as string || "").trim();

  if (!userIdStr) {
    return { error: "Identificador de usuario inválido." };
  }

  const userId = parseInt(userIdStr, 10);
  if (isNaN(userId)) {
    return { error: "Identificador de usuario inválido." };
  }

  const fieldErrors: Record<string, string> = {};

  // 1. Validar Apellido y Nombre
  if (!name) {
    fieldErrors.name = "El Apellido y Nombre es obligatorio.";
  } else if (name.length < 3) {
    fieldErrors.name = "El Apellido y Nombre debe tener al menos 3 caracteres.";
  }

  // 2. Validar Email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    fieldErrors.email = "El correo electrónico es obligatorio.";
  } else if (!emailRegex.test(email)) {
    fieldErrors.email = "Ingrese un formato de correo electrónico válido (ej. usuario@uep.gov.ar).";
  }

  // 3. Validar Contraseña y Confirmación (opcional en edición)
  if (password) {
    if (password.length < 6) {
      fieldErrors.password = "La contraseña debe tener al menos 6 caracteres.";
    }
    if (!confirmPassword) {
      fieldErrors.confirmPassword = "Debe repetir la nueva contraseña.";
    } else if (password !== confirmPassword) {
      fieldErrors.confirmPassword = "Las contraseñas no coinciden.";
    }
  } else if (confirmPassword) {
    fieldErrors.password = "Debe ingresar la nueva contraseña.";
  }

  // 4. Validar Rol
  if (!role || allRoles.length === 0) {
    fieldErrors.role = "Debe seleccionar al menos un rol para el operador.";
  }

  // 5. Validar Código de Operador
  if (operador && operador.length > 10) {
    fieldErrors.operador = "El código de operador no puede superar los 10 caracteres.";
  }

  // 6. Validar CUIT/CUIL
  if (cuit) {
    const cleanCuit = cuit.replace(/[^\d]/g, "");
    if (cleanCuit.length !== 11) {
      fieldErrors.cuit = "El CUIT/CUIL debe contener exactamente 11 dígitos numéricos.";
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      error: "Por favor complete o corrija los campos requeridos.",
      fieldErrors,
    };
  }

  const normalizedEmail = email.toLowerCase();

  try {
    // Check if another user already has this email
    const duplicateEmailUser = await prisma.user.findFirst({
      where: {
        email: normalizedEmail,
        id: { not: userId },
      },
    });

    if (duplicateEmailUser) {
      return {
        error: `Ya existe otro usuario registrado con el correo electrónico "${normalizedEmail}".`,
        fieldErrors: {
          email: "Ya existe un usuario con este correo electrónico.",
        },
      };
    }

    let hashedPassword: string | undefined = undefined;
    if (password) {
      const authContext = await auth.$context;
      hashedPassword = await authContext.password.hash(password);
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update user in imPersonal
      const updateData: any = {
        name: name.toUpperCase(),
        email: normalizedEmail,
        role,
        operador: operador || normalizedEmail.split("@")[0].substring(0, 10),
        cuit: cuit ? cuit.replace(/[^\d]/g, "") : null,
        hospitalId: hospitalIdStr ? parseInt(hospitalIdStr, 10) : null,
      };

      if (hashedPassword) {
        updateData.password = hashedPassword;
      }

      await tx.user.update({
        where: { id: userId },
        data: updateData,
      });

      // 2. Update or create Account for Better Auth credentials
      const existingAccount = await tx.account.findFirst({
        where: { userId },
      });

      if (existingAccount) {
        const accountUpdateData: any = {
          accountId: normalizedEmail,
          updatedAt: new Date(),
        };
        if (hashedPassword) {
          accountUpdateData.password = hashedPassword;
        }
        await tx.account.update({
          where: { id: existingAccount.id },
          data: accountUpdateData,
        });
      } else if (hashedPassword) {
        await tx.account.create({
          data: {
            id: `account-${userId}`,
            accountId: normalizedEmail,
            providerId: "credential",
            userId,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    });

    revalidatePath("/dashboard/users");
    return { success: true };
  } catch (e: any) {
    console.error("Error updating user in imPersonal:", e);
    if (
      e.code === "P2002" ||
      e.message?.includes("UNIQUE KEY") ||
      e.message?.includes("Unique constraint") ||
      e.message?.includes("email")
    ) {
      return {
        error: `Ya existe un usuario registrado con el correo electrónico "${normalizedEmail}".`,
        fieldErrors: {
          email: "Ya existe un usuario con este correo electrónico.",
        },
      };
    }
    return { error: e.message || "Error al actualizar el operador." };
  }
}

export async function toggleUserStatusAction(formData: FormData): Promise<void> {
  const userIdStr = formData.get("userId") as string;
  const currentEstadoStr = formData.get("currentEstado") as string;
  if (!userIdStr) return;

  const userId = parseInt(userIdStr, 10);
  const currentEstado = currentEstadoStr ? parseInt(currentEstadoStr, 10) : 1;
  const newEstado = currentEstado === 0 ? 1 : 0; // 0 = Inactivo, 1 = Activo

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { estado: newEstado },
      });
    });

    revalidatePath("/dashboard/users");
  } catch (e: any) {
    console.error("Error updating user estado in imPersonal:", e);
  }
}
