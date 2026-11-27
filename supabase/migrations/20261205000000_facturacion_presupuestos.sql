-- Facturación de presupuestos aprobados (pestaña Facturación). Se puede correr más de una vez.
--   · Al aprobar un presupuesto se crea una fila con el importe neto (venta). Si el cliente manda la OC en
--     partes, se divide en varias filas del mismo presupuesto.
--   · Área y detalle (cliente · marca · proyecto) se leen del presupuesto, no se copian.
--   · Con FC N° cargado la fila está "Facturado"; si no, "Pendiente de facturar". Cuando todas las filas de un
--     presupuesto tienen FC N°, la ejecución del presupuesto pasa a "Facturado".
-- No reemplaza a "Facturación del proyecto" de Costos reales (tabla facturacion), que se revisa más adelante.

-- El estado "finalizado" lo usa la app (Ejecución) pero nunca se había agregado al tipo.
-- (Abajo se compara como texto: un valor nuevo de un enum no se puede usar en la misma transacción.)
alter type public.estado_presupuesto add value if not exists 'finalizado' after 'en_ejecucion';

create table if not exists public.presupuesto_facturas (
  id uuid primary key default gen_random_uuid(),
  presupuesto_id uuid not null references public.presupuestos(id) on delete cascade,
  orden integer not null default 0,
  importe_neto numeric(14,2) not null default 0 check (importe_neto >= 0),
  periodo date,                 -- mes de facturación (se guarda el día 1)
  oc_numero text,
  fc_numero text,
  fc_enviada boolean not null default false,
  pagada boolean not null default false,
  comentarios text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists presupuesto_facturas_presupuesto_idx on public.presupuesto_facturas (presupuesto_id);

drop trigger if exists presupuesto_facturas_updated_at on public.presupuesto_facturas;
create trigger presupuesto_facturas_updated_at before update on public.presupuesto_facturas
  for each row execute function public.touch_updated_at();

alter table public.presupuesto_facturas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'presupuesto_facturas' and policyname = 'autenticados') then
    create policy "autenticados" on public.presupuesto_facturas for all to authenticated using (true) with check (true);
  end if;
end $$;

-- Presupuestos que ya estaban aprobados: una fila con la venta de su versión aprobada.
insert into public.presupuesto_facturas (presupuesto_id, importe_neto)
select p.id, coalesce((v.datos -> 'totales' ->> 'venta')::numeric, 0)
from public.presupuestos p
left join public.presupuesto_versiones v on v.presupuesto_id = p.id and v.version = p.version
where p.estado::text in ('aprobado', 'en_ejecucion', 'finalizado', 'facturado')
  and not exists (select 1 from public.presupuesto_facturas f where f.presupuesto_id = p.id);

notify pgrst, 'reload schema';
