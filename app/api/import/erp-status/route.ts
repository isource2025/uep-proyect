import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const fcCount = await prisma.cbte.count({ where: { type: "FC" } });
    const rcCount = await prisma.cbte.count({ where: { type: "RC" } });
    const appliesCount = await prisma.cbteAplica.count();
    const purchasesCount = await prisma.compra.count();

    return NextResponse.json({
      success: true,
      fcCount,
      rcCount,
      appliesCount,
      purchasesCount,
    });
  } catch (error: any) {
    console.error("Error fetching ERP status:", error);
    return NextResponse.json({ error: "Error de conexión con base de datos ERP." }, { status: 500 });
  }
}
