# Quo · Presupuestos

App web de la agencia para armar presupuestos, aprobarlos, cargar los costos reales y ver la rentabilidad de cada proyecto.
Replica la lógica de la planilla **Presupuestos y Rentabilidad**.

Stack: Next.js 16 (App Router) en Vercel · Supabase (Postgres + Auth) · TypeScript · Tailwind · Vitest.

## Cómo funciona

- **Conceptos**: la base de todo lo que se presupuesta (rubro, unidad, origen Propio / Proveedor / Personal, tarifa de costo,
  proveedor habitual, markup propio, “por defecto”). La migración trae precargado el catálogo de la planilla.
  Cada rubro es de un área (BTL, Trade…) o **común** (Personal, Logística y flete, Viáticos, Otros); un presupuesto ofrece los
  rubros de su área más los comunes (un área sin rubros propios ve todo). Para algo fuera de catálogo: concepto **OTROS**.
- **Presupuesto**: cabecera (cliente, marca, área, proyecto/evento, fecha de elaboración, fecha del evento, responsable) y líneas por rubro.
  Cliente, marca y responsable son desplegables (A → Z, con “OTROS” siempre al final). Las marcas dependen del cliente y se
  editan en **Clientes**; todos los clientes tienen además la marca “OTROS”. Los responsables se editan en **Configuración**.
  El ID se asigna solo: `<prefijo del área>-<código del cliente>-<correlativo>` (ej. `BTL-CCU-001`).
  - costo = precio × cantidad × horas × días (vacío = 1)
  - markup = el de la línea › el del tramo › el del concepto › el general (multiplicador: 1,4 = +40 %)
  - **markup por tramo** (Trade): según el costo total del presupuesto (hasta $1.000.000 ×1,7; hasta $2.000.000 ×1,6;
    hasta $3.500.000 ×1,55; más ×1,5). Se edita en Configuración; “hasta” incluye el monto.
  - **líneas por medida** (rubros de Trade): base × altura, piezas y cotización total del proveedor → m² y $/m²
    (o $/pieza). Se compara con la última cotización del mismo proveedor y con el promedio de los últimos 6 meses.
    Si un presupuesto ya enviado tiene el mismo concepto, proveedor, medidas y costo, se mantiene su markup
    (con un aviso y link a ese presupuesto) para no cambiarle el precio al cliente. Ver `src/lib/medidas.ts`.
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

### Migraciones

Por ahora se aplican **a mano**: después de mergear un PR que agrega un archivo en `supabase/migrations/`,
copiar su contenido en Supabase → SQL Editor → *New query* → *Run*.

La action **Migraciones Supabase** (`.github/workflows/migraciones.yml`) puede aplicarlas sola, pero está desactivada
hasta corregir el secreto `SUPABASE_DB_URL` (cadena *Session pooler* con la contraseña real de la base). Para reactivarla,
volver a agregar el disparo `push` en el workflow.

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
