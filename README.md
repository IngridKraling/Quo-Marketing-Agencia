# Quo · Presupuestos

App web de la agencia para armar presupuestos, aprobarlos, cargar los costos reales y ver la rentabilidad de cada proyecto.
Replica la lógica de la planilla **Presupuestos y Rentabilidad**.

Stack: Next.js 16 (App Router) en Vercel · Supabase (Postgres + Auth) · TypeScript · Tailwind · Vitest.

## Cómo funciona

- **Conceptos**: la base de todo lo que se presupuesta (rubro, unidad, origen Propio / Proveedor / Personal, tarifa de costo,
  proveedor habitual, markup propio, “por defecto”). La migración trae precargado el catálogo de la planilla.
- **Presupuesto**: cabecera (cliente, marca, área, proyecto/evento, fecha de elaboración, fecha del evento, responsable) y líneas por rubro.
  El ID se asigna solo: `<prefijo del área>-<código del cliente>-<correlativo>` (ej. `BTL-CCU-001`).
  - costo = precio × cantidad × horas × días (vacío = 1)
  - markup = el de la línea › el del concepto › el general (multiplicador: 1,4 = +40 %)
  - venta = costo × markup · impuestos s/venta = venta × impuestos activos (IIBB) · contribución = venta − costo − impuestos
  - alertas por rubro: sin cotizar, revisar “Otros”, margen bajo.
- **Aprobar y congelar**: valida (sin cantidades en 0, sin líneas sin rubro ni precio), guarda una copia de la versión y la bloquea.
  Para cambiarla: *Crear nueva versión* (los costos reales ya cargados se mantienen).
- **Costos reales**: por línea, “igual a presupuesto”, cambios puntuales (lo vacío toma lo presupuestado) o monto de la factura.
  Estados: Pendiente / OK / Excedido / Ahorro / No presupuestado. Al final, el desvío total ($ y %) entre presupuestado y real. Gastos no presupuestados. Control por rubro y resultado del
  proyecto contra lo facturado.
- **Vista cliente**: rubros y conceptos con precio de venta, subtotal, IVA y total; imprimible / PDF. Sin costos ni observaciones.
- **Configuración**: markup general, margen mínimo, IVA, impuestos s/venta, rubros, áreas y proveedores.

## Puesta en marcha

1. **Supabase**: crear un proyecto y, en SQL Editor, correr en orden los archivos de `supabase/migrations/`
   (o `supabase link` + `supabase db push` con la CLI).
   En Authentication → Sign In / Providers, **desactivar los registros públicos** e invitar a los usuarios de la agencia desde
   Authentication → Users. En URL Configuration, poner la URL de Vercel como Site URL y agregar `https://<tu-dominio>/auth/callback`.
2. **Vercel**: importar el repo de GitHub y cargar en Settings → Environment Variables:
   `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` (Supabase → Project Settings → API Keys).
3. **Local** (opcional): copiar `.env.example` a `.env.local`, `npm install` y `npm run dev`.

### Migraciones automáticas

Al mergear a `main` un PR que agrega archivos en `supabase/migrations/`, la action **Migraciones Supabase**
(`.github/workflows/migraciones.yml`) los aplica en la base. Solo corre lo que todavía no figura en el historial de migraciones.

- Secreto necesario en GitHub → Settings → Secrets and variables → Actions: `SUPABASE_DB_URL`, la cadena de
  **Session pooler** de Supabase (botón *Connect* del proyecto) con la contraseña de la base en lugar de `[YOUR-PASSWORD]`.
- Las migraciones que se corrieron a mano antes de automatizar están en `APLICADAS_A_MANO` dentro del workflow, y se marcan
  como aplicadas en cada corrida. Si alguna vez se corre otra a mano, agregar su versión (los 14 números del inicio del archivo) ahí.
- Para volver a correrlo a mano: Actions → Migraciones Supabase → *Run workflow*.

Las variables de Sigma y Connecteam son opcionales: sin `SIGMA_TOKEN` la app no muestra nada de Sigma.

## Estructura

```
src/lib/presupuesto-calc.ts     fórmulas (puras, con tests contra números reales de la planilla)
src/app/actions.ts              server actions (guardar, aprobar, versiones, costos reales, catálogo)
src/components/editor-*.tsx     editor de presupuesto y de costos reales
src/app/(app)/                  páginas: presupuestos, conceptos, clientes, configuración
src/lib/sigma/                  integración con Sigma (para más adelante)
supabase/migrations/            esquema, RLS y catálogo inicial
```

## Pendientes

- Activos propios: rendimiento de la inversión de cada material (planilla Activos_Propios / Gastos_Activos).
- Comparar dos versiones aprobadas línea por línea.
- Integración con Sigma (facturación y costos desde facturas de compra) y Connecteam (horas reales).
