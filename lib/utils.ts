import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function serializeData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "bigint") {
    return Number(obj) as any;
  }

  // Check for Decimal objects (from Prisma or Decimal.js)
  if (
    typeof obj === "object" &&
    obj !== null &&
    (typeof (obj as any).toNumber === "function" ||
      ("d" in obj && "s" in obj && "e" in obj))
  ) {
    return Number(obj) as any;
  }

  if (obj instanceof Date) {
    return obj as any;
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeData) as any;
  }

  if (typeof obj === "object") {
    const serialized: any = {};
    for (const key of Object.keys(obj)) {
      serialized[key] = serializeData((obj as any)[key]);
    }
    return serialized;
  }

  return obj;
}
