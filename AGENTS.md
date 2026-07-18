<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules --> 

# Project Context & Workflow (UEP Proyect)
 
## Database Configuration
- **DBMS**: SQL Server (MSSQL)
- **Database Name**: `UEP`
- **Default Port**: 1433
- **Connection String**: `sqlserver://181.98.96.200:1433;database=UEP;user=sa;password=isource;encrypt=false;trustServerCertificate=true`
- **ORM**: Prisma (using `@prisma/client` and `prisma`)
- **Connection Adapter**: Instantiated using `@prisma/adapter-mssql` (PrismaMssql).

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

## Architectural Rules & Gotchas
- **Prisma Client Generation Path**: Generated to a custom path (`output = "../lib/generated/prisma"` in `schema.prisma`). Client models must be imported from `@/lib/generated/prisma/client` instead of the default `@prisma/client`.
- **Better Auth Passwords**: Account credentials must be hashed via Better Auth's runtime context helper (`(await auth.$context).password.hash(password)`) to prevent `Invalid password hash` rejections.
- **Seeded Admin Account**: `admin@uep.gov.ar` / `admin123`.
- **Theme Toggle**: Wrapped with `ThemeProvider` from `next-themes`. App has `defaultTheme="system"` enabled, but the `ThemeToggle` dropdown options are limited to "Claro" (`light`) and "Oscuro" (`dark`).
- **Next.js 16 Asynchronous Headers**: In Next.js 16, `headers()` is asynchronous and must be awaited when retrieving sessions.
- **Database Safety & Integrity**: 
  - **NUNCA** borrar datos de la base de datos (operaciones como `deleteMany`, `DELETE`, `TRUNCATE` o `DROP` están terminantemente prohibidas en seeds o scripts generales).
  - La base de datos de producción (`iSource`) es estrictamente de **sólo lectura/inspección**. No realizar modificaciones de esquema ni agregar registros en ella para mantener la paridad estructural idéntica con desarrollo.
- **Consolidación e Intermediación de Facturación**:
  - Los comprobantes individuales emitidos por hospitales se almacenan en la tabla `Compras`.
  - La unificación por Obra Social (`IdCliente`) crea una factura de venta consolidada en la tabla `Cbtes` (con `TipoCbte: 'FC'` y `Letra_Cbte: 'A'`).
  - La relación transaccional se establece vinculando cada `Compra` a su factura unificada mediante `IdTransaccionFacturaVta` (`fcVentaId`).
  - El campo clave primaria `IdTransaccion` en `Cbtes` y `idtransaccion` en `Compras` no poseen autoincremento (identity) nativo. Cada inserción manual en estas tablas requiere calcular `maxId + 1` de forma segura.

