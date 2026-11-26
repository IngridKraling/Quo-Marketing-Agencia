-- Esquema inicial: presupuestos por horas × tarifa + costos externos + markup,
-- con integración a Sigma (facturas) y Connecteam (horas reales).

create extension if not exists "pgcrypto";

-- Roles / perfiles de la agencia con su costo hora interno.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  costo_hora numeric(12,2) not null check (costo_hora >= 0),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Personas del equipo. connecteam_user_id vincula las horas fichadas.
create table public.miembros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text,
  rol_id uuid references public.roles(id) on delete set null,
  costo_hora numeric(12,2) check (costo_hora >= 0), -- override del costo del rol
  connecteam_user_id bigint unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Clientes, sincronizados desde Sigma (ExportClientes).
create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  sigma_cliente_id text unique,
  nombre text not null,
  tipo_documento text,
  numero_documento text,
  condicion_iva text,            -- descripción corta que devuelve Sigma (ej. "RI")
  sigma_tipo_iva integer,        -- código numérico para ImportFactura (ExportDatosGenerales → tiposIvaCliente)
  sigma_condicion_venta text,    -- ej. "00"
  sigma_vendedor text,
  email text,
  activo boolean not null default true,
  sigma_sincronizado_at timestamptz,
  created_at timestamptz not null default now()
);

create type public.estado_presupuesto as enum ('borrador', 'enviado', 'aprobado', 'rechazado', 'facturado');

create table public.presupuestos (
  id uuid primary key default gen_random_uuid(),
  numero integer generated always as identity unique,
  cliente_id uuid references public.clientes(id) on delete restrict,
  titulo text not null,
  estado public.estado_presupuesto not null default 'borrador',
  markup_horas_pct numeric(6,2) not null default 0,     -- margen sobre el costo de horas
  markup_externos_pct numeric(6,2) not null default 0,  -- fee sobre costos externos (pauta, producción)
  iva_pct numeric(5,2) not null default 21,
  valido_hasta date,
  notas text,
  connecteam_job_id text,  -- job/proyecto de Connecteam para comparar horas reales
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.presupuesto_horas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  orden integer not null default 0,
  descripcion text not null,
  rol_id uuid references public.roles(id) on delete set null,
  horas numeric(10,2) not null check (horas >= 0),
  costo_hora numeric(12,2) not null check (costo_hora >= 0) -- snapshot al momento de presupuestar
);

create table public.presupuesto_externos (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  orden integer not null default 0,
  descripcion text not null,
  costo numeric(14,2) not null check (costo >= 0),
  markup_pct numeric(6,2) -- null = usa markup_externos_pct del presupuesto
);

create type public.estado_factura as enum ('pendiente', 'enviada', 'error');

-- Cada intento de enviar una factura a Sigma (ImportFactura).
create table public.facturas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete restrict,
  fecha date not null,
  numero_comprobante text not null,
  subtotal numeric(14,2) not null,
  iva numeric(14,2) not null,
  total numeric(14,2) not null,
  estado public.estado_factura not null default 'pendiente',
  sigma_payload jsonb not null,
  sigma_respuesta text,
  sigma_error_kind text,
  enviada_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

-- Horas reales traídas de Connecteam (time activities).
create table public.horas_reales (
  id uuid primary key default gen_random_uuid(),
  connecteam_activity_id text not null unique,
  connecteam_user_id bigint not null,
  miembro_id uuid references public.miembros(id) on delete set null,
  connecteam_job_id text,
  presupuesto_id uuid references public.presupuestos(id) on delete set null,
  inicio timestamptz not null,
  fin timestamptz,
  horas numeric(8,2) not null default 0,
  sincronizado_at timestamptz not null default now()
);
create index on public.horas_reales (connecteam_job_id);
create index on public.horas_reales (presupuesto_id);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger presupuestos_updated_at before update on public.presupuestos
  for each row execute function public.touch_updated_at();

-- RLS: herramienta interna; cualquier usuario autenticado de la agencia opera.
-- Las altas de usuarios se controlan desde Supabase Auth (deshabilitar signups públicos).
do $$
declare t text;
begin
  foreach t in array array['roles','miembros','clientes','presupuestos','presupuesto_horas',
                           'presupuesto_externos','facturas','horas_reales']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "autenticados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
