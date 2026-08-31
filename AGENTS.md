<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules --> 

# Project Context & Workflow (UEP Proyect)
 
## Database Configuration
- **DBMS**: SQL Server (MSSQL)
- **Database Name**: `UEP`
- **Default Port**: 1433
- **Connection String (local WEBDEV)**: `sqlserver://192.168.1.47:1433;database=UEP;user=sa;password=isource;encrypt=false;trustServerCertificate=true`
- **Connection String (Vercel / IP pública WEBDEV)**: `sqlserver://190.231.14.131:1433;database=UEP;user=sa;password=isource;encrypt=false;trustServerCertificate=true`
- **Auth env (required on Vercel)**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
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
  - **CONSULTA Y APROBACIÓN PREVIA OBLIGATORIA**: **NUNCA** realizar ningún cambio en la base de datos (crear tablas, modificar o eliminar tablas, agregar campos, cambiar nombres de columnas, alterar tipos de datos, índices, relaciones o ejecutar migraciones DDL) sin **consultar primero al usuario y obtener su confirmación explícita**, detallando previamente el cambio propuesto y su justificación.
  - **NUNCA** borrar datos de la base de datos (operaciones como `deleteMany`, `DELETE`, `TRUNCATE` o `DROP` están terminantemente prohibidas en seeds o scripts generales).
  - La base de datos de producción (`iSource`) es estrictamente de **sólo lectura/inspección**. No realizar modificaciones de esquema ni agregar registros en ella para mantener la paridad estructural idéntica con desarrollo.
- **Consolidación e Intermediación de Facturación**:
  - Los comprobantes individuales emitidos por hospitales se almacenan en la tabla `Compras`.
  - La unificación por Obra Social (`IdCliente`) crea una factura de venta consolidada en la tabla `Cbtes` (con `TipoCbte: 'FC'` y `Letra_Cbte: 'A'`).
  - La relación transaccional se establece vinculando cada `Compra` a su factura unificada mediante `IdTransaccionFacturaVta` (`fcVentaId`).
  - El campo clave primaria `IdTransaccion` en `Cbtes` y `idtransaccion` en `Compras` no poseen autoincremento (identity) nativo. Cada inserción manual en estas tablas requiere calcular `maxId + 1` de forma segura.
- **Evitar Scroll Horizontal**: Queda estrictamente prohibido el uso de scroll horizontal en tablas y grillas del sistema. Utilizar anchos de columna definidos, saltos de línea automáticos (`whitespace-normal` / `break-words`) o truncamiento de texto para asegurar que todas las páginas se ajusten de forma responsiva al viewport.
- **Seguridad e Información Sensible**:
  - **NUNCA** dejar credenciales, contraseñas, tokens de API o cualquier tipo de información sensible en texto plano dentro del código fuente, carpetas públicas o scripts del proyecto.
  - Cualquier script utilitario temporal que contenga secretos o contraseñas debe ser eliminado inmediatamente tras su ejecución, y en caso de ser necesario conservarlo, se debe requerir la aprobación explícita del usuario informándole la presencia de datos sensibles.

## Especificaciones Oficiales del Sistema (Pliego Funcional)
- **1. Importación SISPER (Nómina de Agentes)**:
  - Estructura: `DNI`, `CUIL`, `APELLIDO Y NOMBRE`, `PUESTO LABORAL`, `ESTABLECIMIENTO SANITARIO` (Hospital), `CONCEPTO` (*Honorarios Médicos*, *Sobreasignación al Personal*), `OBRA SOCIAL`, `MES`, `AÑO`, `IMPORTE`.
  - Destino: Se guarda en la tabla `Agent` (médicos/agentes del MSP), **sin relación con operadores de login (`User` / `imPersonal`)**.
- **2. Rol Operador (Liquidaciones y Débitos)**:
  - Búsqueda por comprobantes UEP (`FC N° UEP` o `RECIBO UEP`) trayendo todas las `Compras` de hospitales incluidas.
  - Campos de liquidación editables por operador: `CREDITOS`, `DEBITOS`, `AJUSTES O.S.`, `PENDIENTES DE COBRO`, `BRUTO A PAGAR`, `GA` (Gastos Administrativos), `AJUSTE POR RECUPERO` y `NETO A PAGAR`.
  - Módulo para adjuntar el escaneado en PDF/Documento de débitos enviado por la Obra Social.
- **3. Portal del Hospital & Distribución**:
  - Notificación automática por email a cada hospital al generar su liquidación.
  - Cada hospital ingresa a su portal antes de la fecha límite y realiza la distribución del `NETO A PAGAR` por Obra Social en: `HONORARIOS`, `SOBREASIGNACION` y `GASTOS`.
- **4. Consolidación Final SISPER y Tesorería**:
  - **Exportación SISPER**: Al vencer la fecha límite, el sistema consolida todos los agentes de todos los hospitales con sus montos asignados en una sola planilla exportable para los recibos de haberes.
  - **Reporte de Tesorería**: Genera el informe de `GASTOS` a transferir por Obra Social a cada Hospital para transferencias bancarias.


