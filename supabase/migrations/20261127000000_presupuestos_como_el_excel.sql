-- Modelo de presupuestos tomado del Excel "Presupuestos y Rentabilidad":
--   · Catálogo de conceptos por rubro (unidad, origen, tarifa de costo, proveedor, markup propio, por defecto).
--   · Línea: costo = precio × cantidad × horas × días (vacío = 1);
--            venta = costo × markup (override de la línea › markup del concepto › markup general);
--            impuestos s/venta = venta × Σ impuestos activos; contribución = venta − costo − impuestos.
--   · Costos reales por línea: "igual a presupuesto", cambios puntuales o monto de factura.
--   · Gastos no presupuestados, facturación registrada y control presupuestado vs. real.
-- Las tablas presupuesto_horas / presupuesto_externos, roles y miembros del esquema inicial quedan sin uso.

alter type public.estado_presupuesto add value if not exists 'en_ejecucion' after 'aprobado';
alter type public.estado_presupuesto add value if not exists 'cancelado';

create type public.origen_linea as enum ('propio', 'proveedor', 'personal');
create type public.fuente_costo as enum ('sigma', 'manual', 'caja_chica', 'connecteam');

-- Parámetros generales (una sola fila).
create table public.parametros (
  id boolean primary key default true check (id),
  markup_default numeric(6,3) not null default 1.4 check (markup_default > 0), -- multiplicador: venta = costo × markup
  margen_minimo_pct numeric(5,2) not null default 20,     -- alerta "Margen bajo" por rubro
  tolerancia_desvio_pct numeric(5,2) not null default 10, -- costo real: Excedido / Ahorro
  iva_pct numeric(5,2) not null default 21,               -- vista cliente
  updated_at timestamptz not null default now()
);
insert into public.parametros default values;

-- Impuestos sobre la venta: se suman los activos.
create table public.impuestos_venta (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  porcentaje numeric(6,3) not null check (porcentaje >= 0),
  activo boolean not null default true,
  orden integer not null default 0
);
insert into public.impuestos_venta (nombre, porcentaje, activo, orden) values
  ('IIBB', 5, true, 10),
  ('Imp. municipales', 1.2, false, 20),
  ('Imp. al cheque', 1.2, false, 30);

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  prefijo text not null unique, -- prefijo del ID del proyecto (BTL-CCU-001)
  orden integer not null default 0,
  activo boolean not null default true
);
insert into public.areas (nombre, prefijo, orden) values
  ('BTL', 'BTL', 10),
  ('Proyectos especiales', 'PE', 20),
  ('Trade Marketing', 'TM', 30),
  ('Otros', 'OTR', 40);

create table public.rubros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  orden integer not null default 0,
  alerta_sin_cotizar boolean not null default false, -- "⚠ Sin cotizar" si el rubro queda en 0
  revisar_si_se_usa boolean not null default false,  -- "Revisar: ¿falta un rubro?" (Otros)
  activo boolean not null default true
);

create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

alter table public.clientes add column codigo text unique; -- parte del ID del proyecto

create table public.conceptos (
  id uuid primary key default gen_random_uuid(),
  rubro_id uuid not null references public.rubros(id) on delete restrict,
  nombre text not null unique,
  unidad text,
  origen public.origen_linea not null default 'proveedor',
  tarifa numeric(14,2) check (tarifa >= 0),          -- costo neto; vacío = se cotiza en cada presupuesto
  proveedor_id uuid references public.proveedores(id) on delete set null,
  markup numeric(6,3) check (markup > 0),            -- vacío = markup general
  por_defecto boolean not null default false,        -- se carga solo en un presupuesto nuevo (con cantidad 0)
  cantidad_def numeric(12,2),
  horas_def numeric(8,2),
  dias_def numeric(8,2),
  observaciones text,
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);
create trigger conceptos_updated_at before update on public.conceptos
  for each row execute function public.touch_updated_at();

alter table public.presupuestos
  add column codigo text unique,
  add column marca text,
  add column area_id uuid references public.areas(id) on delete restrict,
  add column responsable text,
  add column fecha_evento date,
  add column version integer not null default 1,
  add column aprobado_at timestamptz;

-- ID legible: <prefijo del área>-<código del cliente>-<correlativo>, ej. BTL-CCU-001.
create or replace function public.asignar_codigo_presupuesto() returns trigger language plpgsql as $$
declare
  base text;
  siguiente integer;
begin
  if new.codigo is not null then return new; end if;
  select coalesce((select prefijo from public.areas where id = new.area_id), 'P') || '-' ||
         coalesce((select coalesce(codigo, upper(regexp_replace(nombre, '[^A-Za-z0-9]', '', 'g')))
                   from public.clientes where id = new.cliente_id), 'SINCLIENTE')
    into base;
  perform pg_advisory_xact_lock(hashtext(base));
  select coalesce(max(substring(codigo from '-(\d+)$')::integer), 0) + 1 into siguiente
    from public.presupuestos where codigo like base || '-%';
  new.codigo := base || '-' || lpad(siguiente::text, 3, '0');
  return new;
end $$;
create trigger presupuestos_codigo before insert on public.presupuestos
  for each row execute function public.asignar_codigo_presupuesto();

create table public.presupuesto_lineas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  orden integer not null default 0,
  rubro_id uuid references public.rubros(id) on delete restrict,
  concepto_id uuid references public.conceptos(id) on delete set null,
  concepto text not null,
  observaciones text,                                -- uso interno, no sale en la vista cliente
  origen public.origen_linea not null default 'proveedor',
  proveedor text,
  unidad text,
  precio_unitario numeric(14,2) check (precio_unitario >= 0),
  cantidad numeric(12,2) check (cantidad >= 0),
  horas numeric(8,2) check (horas >= 0),
  dias numeric(8,2) check (dias >= 0),
  markup numeric(6,3) check (markup > 0),            -- override de la línea
  markup_concepto numeric(6,3) check (markup_concepto > 0), -- copia del markup del concepto al elegirlo
  presupuestada boolean not null default true,       -- false = gasto no presupuestado (solo costo real)
  -- Costo real
  real_igual boolean not null default false,
  real_precio numeric(14,2) check (real_precio >= 0),
  real_cantidad numeric(12,2) check (real_cantidad >= 0),
  real_horas numeric(8,2) check (real_horas >= 0),
  real_dias numeric(8,2) check (real_dias >= 0),
  real_monto numeric(14,2) check (real_monto >= 0),  -- monto de la factura: pisa todo lo demás
  real_fuente public.fuente_costo,
  real_comprobante text,
  real_fecha date,
  real_observaciones text,
  created_at timestamptz not null default now()
);
create index on public.presupuesto_lineas (presupuesto_id);

-- Facturas emitidas por proyecto (venta real del control).
create table public.facturacion (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete restrict,
  fecha date not null,
  numero text not null,
  monto_neto numeric(14,2) not null check (monto_neto > 0),
  observaciones text,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.facturacion (presupuesto_id);

-- Copia congelada de cada versión aprobada (cabecera + líneas + totales), para consultarla después.
create table public.presupuesto_versiones (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  version integer not null,
  datos jsonb not null,
  aprobado_at timestamptz not null default now(),
  aprobado_por uuid references auth.users(id) default auth.uid(),
  unique (presupuesto_id, version)
);

do $$
declare t text;
begin
  foreach t in array array['parametros','impuestos_venta','areas','rubros','proveedores','conceptos',
                           'presupuesto_lineas','facturacion','presupuesto_versiones']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "autenticados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Datos iniciales: catálogo del Excel ----------

insert into public.rubros (nombre, orden, alerta_sin_cotizar, revisar_si_se_usa) values
  ('Personal', 10, false, false),
  ('Logística y flete', 20, true, false),
  ('Viaticos', 30, true, false),
  ('Estructuras y stand', 40, false, false),
  ('Tecnica', 50, false, false),
  ('Ambientación', 60, false, false),
  ('Otros', 70, false, true),
  ('Grafica', 80, false, false),
  ('Juegos', 90, false, false),
  ('Plan de medios', 100, false, false);

insert into public.proveedores (nombre) values
  ('Grafica NOA'),
  ('Nazareno'),
  ('Hahn'),
  ('Quo Marketing'),
  ('El Angel'),
  ('Walter taxista'),
  ('Publisite'),
  ('Manzana'),
  ('Mendez'),
  ('FC'),
  ('MG Grafica'),
  ('Proveedor externo');

insert into public.clientes (nombre, codigo) values
  ('OTROS', 'OTROS'),
  ('Arca', 'ARCA'),
  ('Gemsa', 'GEMSA'),
  ('Rolcar', 'ROLCAR'),
  ('Levite', 'LEVITE'),
  ('Romar', 'ROMAR'),
  ('CCU', 'CCU');

insert into public.conceptos (rubro_id, nombre, unidad, origen, tarifa, proveedor_id, markup, por_defecto, cantidad_def, horas_def, dias_def, observaciones)
select r.id, v.nombre, v.unidad, v.origen::public.origen_linea, v.tarifa::numeric, p.id, v.markup::numeric, v.por_defecto, v.cd::numeric, v.hd::numeric, v.dd::numeric, v.obs::text
from (values
  ('Personal', 'Supervisor', 'Hora', 'personal', 10000, 'Quo Marketing', 1.6, true, null, null, null, null),
  ('Personal', 'Ayudante para armado/desarme', 'Hora', 'personal', 6200, 'Quo Marketing', 1.6, true, null, null, null, null),
  ('Personal', 'Ayudante para evento', 'Hora', 'personal', 6200, 'Quo Marketing', 1.6, true, null, null, null, null),
  ('Personal', 'Ayudante ruta', 'Hora', 'personal', 3100, 'Quo Marketing', 1.6, false, null, null, null, null),
  ('Personal', 'Promotoras', 'Hora', 'personal', 9300, 'Quo Marketing', 1.6, true, null, null, null, null),
  ('Logística y flete', 'Camioneta para flete', 'Servicio', 'propio', 100000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Logística y flete', 'Camioneta para evento', 'Servicio', 'propio', 100000, 'Quo Marketing', 1.4, true, null, null, null, null),
  ('Logística y flete', 'Traslado de promotoras', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Logística y flete', 'Flete', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Logística y flete', 'Envio', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Viaticos', 'Viaticos ayudantes', 'Servicio', 'proveedor', 20000, 'Proveedor externo', 1.4, true, null, null, null, 'Por defecto: completar unidad y tarifa si corresponde'),
  ('Viaticos', 'Viaticos promotoras', 'Servicio', 'proveedor', 20000, 'Proveedor externo', 1.4, false, null, null, null, 'Por defecto: completar unidad y tarifa si corresponde'),
  ('Viaticos', 'Hospedaje ayudantes', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, 'Por defecto: completar unidad y tarifa si corresponde'),
  ('Viaticos', 'Hospedaje promotoras', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, 'Por defecto: completar unidad y tarifa si corresponde'),
  ('Estructuras y stand', 'Barras', 'Servicio', 'propio', 50000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Estructuras y stand', 'Piso deck', 'Servicio', 'proveedor', null, 'Manzana', 1.4, false, null, null, null, null),
  ('Estructuras y stand', 'Produccion Photo Opportunity', 'Unidad', 'proveedor', null, 'Publisite', 1.5, false, null, null, null, null),
  ('Estructuras y stand', 'Carteleria', 'Unidad', 'proveedor', null, 'Publisite', 1.5, false, null, null, null, null),
  ('Estructuras y stand', 'Ploteo', 'Unidad', 'proveedor', null, 'Publisite', 1.5, false, null, null, null, null),
  ('Estructuras y stand', 'Cambio de lonas', 'Unidad', 'proveedor', null, 'Publisite', 1.5, false, null, null, null, null),
  ('Estructuras y stand', 'Bastidor', 'Unidad', 'propio', null, 'Quo Marketing', 1.5, false, null, null, null, null),
  ('Tecnica', 'Estructura de truss', 'Unidad', 'proveedor', null, 'Mendez', 1.4, false, null, null, null, null),
  ('Tecnica', 'Sonido', 'Unidad', 'proveedor', null, 'Mendez', 1.4, false, null, null, null, null),
  ('Tecnica', 'Iluminacion', 'Unidad', 'proveedor', null, 'Mendez', 1.4, false, null, null, null, null),
  ('Tecnica', 'Totems LED verticales', 'Unidad', 'proveedor', null, 'Mendez', 1.4, false, null, null, null, null),
  ('Tecnica', 'Pantallas', 'Unidad', 'proveedor', null, 'Mendez', 1.4, false, null, null, null, null),
  ('Tecnica', 'Tarima', 'Unidad', 'proveedor', null, 'Mendez', 1.4, false, null, null, null, null),
  ('Ambientación', 'Alfombra de yute', 'Unidad', 'propio', 20000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Back de madera y hierro', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Barra exhibidora de vidrio', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Bastidores de madera', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Bastoncitos con soga', 'Unidad', 'propio', 15000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Cartel de madera ingreso', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Casitas de truss', 'Unidad', 'propio', 250000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Cesped sintetico', 'Unidad', 'propio', null, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Estanteria de madera y hierro', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Estanterias blancas', 'Unidad', 'propio', 20000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Fondo de barra de madera', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Guirnaldas x10mts', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Hamaca de mimbre', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Juegos de living', 'Unidad', 'propio', 35000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Macetas con plantas', 'Unidad', 'propio', 20000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Macetas para centro de mesas', 'Unidad', 'propio', 5000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Mastiles', 'Unidad', 'propio', 35000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Mesas y banquetas', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, 'Por defecto: completar unidad y tarifa si corresponde'),
  ('Ambientación', 'Muebles de make up', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, 'Por defecto: completar unidad y tarifa si corresponde'),
  ('Ambientación', 'Mural verde', 'Unidad', 'propio', 50000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Muro verde de pie', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, 'Rubro sin conceptos todavía (no borrar)'),
  ('Ambientación', 'Panel de cañas de bambu', 'Unidad', 'propio', 50000, 'Quo Marketing', 1.4, false, null, null, null, 'Rubro sin conceptos todavía (no borrar)'),
  ('Ambientación', 'Pergola con red de sombra', 'Unidad', 'proveedor', 50000, 'Quo Marketing', 1.4, false, null, null, null, 'Rubro sin conceptos todavía (no borrar)'),
  ('Ambientación', 'Pizarras chicas', 'Unidad', 'propio', 10000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Pizarras grandes', 'Unidad', 'propio', 15000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Plantas colgantes', 'Unidad', 'propio', 10000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Portico de madera', 'Unidad', 'propio', 50000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Tachos LED', 'Unidad', 'propio', 20000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Vallas', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Ambientación', 'Velas de sombra azul', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Otros', 'Alfas', 'Unidad', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Otros', 'Cobertura', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Otros', 'Conservadoras', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Otros', 'Corteza', 'Unidad', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Otros', 'Detalle en observacion', 'Unidad', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Otros', 'Dispenser de agua', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Otros', 'DJ', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Otros', 'Hielo', 'Unidad', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Otros', 'Influencer', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Otros', 'Otros', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.4, true, null, null, null, null),
  ('Otros', 'Sponsoreo', 'Servicio', 'proveedor', null, 'Proveedor externo', 1.3, false, null, null, null, null),
  ('Otros', 'Tablets', 'Unidad', 'propio', null, 'Proveedor externo', 1.4, false, null, null, null, null),
  ('Grafica', 'Afiches', 'Unidad', 'proveedor', null, 'Proveedor externo', 1.5, false, null, null, null, null),
  ('Grafica', 'Pancartas', 'Unidad', 'proveedor', null, 'Proveedor externo', 1.5, false, null, null, null, null),
  ('Grafica', 'Pulseras', 'Unidad', 'proveedor', null, 'Proveedor externo', 1.5, false, null, null, null, null),
  ('Grafica', 'Vouchers/cupones', 'Unidad', 'proveedor', null, 'Proveedor externo', 1.5, false, null, null, null, null),
  ('Juegos', 'Dado', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Juegos', 'Embocar bolsita', 'Unidad', 'propio', 30000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Juegos', 'Embocar pelota', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Juegos', 'Juego de bolos', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Juegos', 'Memotest', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Juegos', 'Metegol sentado', 'Unidad', 'propio', 50000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Juegos', 'Ruleta chica', 'Unidad', 'propio', 20000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Juegos', 'Ruleta grande', 'Unidad', 'propio', 40000, 'Quo Marketing', 1.4, false, null, null, null, null),
  ('Plan de medios', 'Radios', 'Unidad', 'proveedor', null, null, 1.4, false, null, null, null, null),
  ('Plan de medios', 'TV', 'Unidad', 'proveedor', null, null, 1.4, false, null, null, null, null)
) as v(rubro, nombre, unidad, origen, tarifa, proveedor, markup, por_defecto, cd, hd, dd, obs)
join public.rubros r on r.nombre = v.rubro
left join public.proveedores p on p.nombre = v.proveedor;
