import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    if (!file) {
      return NextResponse.json({ error: "No se subió ningún archivo Excel." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any>(sheet);

    let updatedCount = 0;
    let createdCount = 0;

    // Get all public hospitals to match
    const hospitals = await prisma.proveedor.findMany({
      where: { tipoProvId: 18 },
    });

    for (const row of rows) {
      const cuil = String(row.CUIL || row.cuil || "").trim().replace(/[^0-9]/g, "");
      const dni = String(row.DNI || row.dni || "").trim().replace(/[^0-9]/g, "");
      const nombre = String(row.Nombre || row.nombre || "").trim().toUpperCase();
      const cargo = String(row.Cargo || row.cargo || "").trim();
      const establecimiento = String(row.Establecimiento || row.establecimiento || "").trim();
      const hospitalName = String(row.Hospital || row.hospital || "").trim().toUpperCase();

      if (!cuil || !nombre) continue;

      // Find matching hospital/proveedor
      const matchingHospital = hospitals.find((h) =>
        h.nombre?.toUpperCase().includes(hospitalName) ||
        hospitalName.includes(h.nombre?.toUpperCase() || "")
      );

      const hospitalId = matchingHospital ? matchingHospital.id : null;

      // Check if agent already exists by CUIL
      const existingAgent = await prisma.agente.findFirst({
        where: { cuil },
      });

      if (existingAgent) {
        // Update establishment and hospital ID
        await prisma.agente.update({
          where: { id: existingAgent.id },
          data: {
            hospitalId,
            nombre,
            cargo,
            establecimiento,
          },
        });
        updatedCount++;
      } else {
        // Create new agent in physical Agente table (ID is auto-incremented in DB)
        await prisma.agente.create({
          data: {
            cuil,
            nombre,
            cargo,
            establecimiento,
            hospitalId,
          },
        });
        createdCount++;
      }
    }

    return NextResponse.json({
      success: true,
      createdCount,
      updatedCount,
      totalCount: rows.length,
    });
  } catch (error: any) {
    console.error("Error importing SISPER Excel:", error);
    return NextResponse.json({ error: "Error interno al procesar planilla Excel." }, { status: 500 });
  }
}
