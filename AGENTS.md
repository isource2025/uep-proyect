<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project Context & Workflow (UEP Proyect)

## Database Configuration
- **DBMS**: MariaDB / MySQL
- **Database Name**: `uep-proyect`
- **Default Port**: 3306
- **Connection String**: `mysql://facundofernandez@localhost:3306/uep-proyect` (No password required for local connection)
- **ORM**: Prisma (using `@prisma/client` and `prisma`)

## Functional Modules
1. **Module 1**: User Management, Security & Configuration (Login, Pass recovery, user/hospital/period management)
2. **Module 2**: Import & Period Prep (ERP CBTES, CBTES_APLICA, COMPRAS, CLIENTES, PROVEEDORES; SISPER Excel import)
3. **Module 3**: Liquidation Generation & Management (RC -> CBTES_APLICA -> CBTES (FC) -> COMPRAS (FC Hospital) -> Liquidation calculation)
4. **Module 4**: Hospital Portal & Distribution (view liquidations, assign fee distributions, download docs)
5. **Module 5**: Consolidation, Reports & Close

## Key Database Models Needed
- **Auth**: User, Session, Account, Verification (compatible with Better Auth)
- **ERP Tables (Simulated/Imported)**: Cliente, Proveedor, Cbte, CbteAplica, Compra
- **System**: Hospital, Period, SystemConfig
- **Liquidation**: Liquidation, LiquidationDetail, Agent, Distribution, Attachment
