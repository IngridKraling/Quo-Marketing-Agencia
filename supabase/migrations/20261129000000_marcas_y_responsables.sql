-- Marcas por cliente y responsables, para los desplegables de la cabecera del presupuesto.
-- presupuestos.marca y presupuestos.responsable siguen siendo texto: guardan el nombre elegido,
-- así un presupuesto viejo no cambia si después se renombra o se desactiva una marca o un responsable.

create table public.marcas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  nombre text not null,
  activo boolean not null default true,
  unique (cliente_id, nombre)
);
create index on public.marcas (cliente_id);

create table public.responsables (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activo boolean not null default true
);

do $$
declare t text;
begin
  foreach t in array array['marcas', 'responsables']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "autenticados" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- Clientes: CCU, ARCA CONTINENTAL, ROMAR, AGUAS DE ORIGEN, OTROS ----------
-- Se identifican por código (el código arma el ID del presupuesto y no cambia).
insert into public.clientes (nombre, codigo) values
  ('CCU', 'CCU'),
  ('ARCA CONTINENTAL', 'ARCA'),
  ('ROMAR', 'ROMAR'),
  ('AGUAS DE ORIGEN', 'ADO'),
  ('OTROS', 'OTROS')
on conflict (codigo) do update set nombre = excluded.nombre, activo = true;

-- Gemsa, Rolcar y Levite no son clientes: son del grupo económico Romar.
-- Sus presupuestos pasan a Romar con esa marca (si no tenían otra) y se borran como clientes.
-- El ID de esos presupuestos (ej. BTL-GEMSA-001) no cambia.
update public.presupuestos p
set cliente_id = (select id from public.clientes where codigo = 'ROMAR'),
    marca = coalesce(nullif(trim(p.marca), ''), upper(c.nombre))
from public.clientes c
where p.cliente_id = c.id and c.codigo in ('GEMSA', 'ROLCAR', 'LEVITE');

delete from public.clientes where codigo in ('GEMSA', 'ROLCAR', 'LEVITE');

-- ---------- Marcas ----------
insert into public.marcas (cliente_id, nombre)
select c.id, m.nombre
from (values
  ('CCU', 'CERVEZA NORTE'),
  ('CCU', 'CERVEZA SALTA'),
  ('ARCA', 'POWERADE'),
  ('ARCA', 'COCA COLA'),
  ('ARCA', 'ADES'),
  ('ARCA', 'FANTA'),
  ('ARCA', 'SPRITE'),
  ('ARCA', 'MONSTER'),
  ('ARCA', 'BENEDICTINO'),
  ('ARCA', 'ESTRELLA GALICIA'),
  ('ARCA', 'SCHWEPPES'),
  ('ROMAR', 'TEILEN'),
  ('ROMAR', 'GEMSA'),
  ('ROMAR', 'ROLCAR'),
  ('ROMAR', 'LEVITE'),
  ('ROMAR', 'BROOK MOTORS'),
  ('ROMAR', 'BYD'),
  ('ROMAR', 'MATSU'),
  ('ROMAR', 'JEEP')
) as m(codigo, nombre)
join public.clientes c on c.codigo = m.codigo
on conflict (cliente_id, nombre) do nothing;

-- ---------- Responsables ----------
insert into public.responsables (nombre) values
  ('ALINA'),
  ('BIANCA'),
  ('ALEJANDRO'),
  ('INGRID')
on conflict (nombre) do nothing;
