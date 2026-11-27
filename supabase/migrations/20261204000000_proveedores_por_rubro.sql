-- Proveedores por rubro: cada proveedor puede trabajar en varios rubros (y así en varias áreas).
-- En un presupuesto, la lista de proveedores de una línea muestra primero los de ese rubro y después
-- los que todavía no tienen ningún rubro asignado. Se puede correr más de una vez.
create table if not exists public.proveedor_rubros (
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  rubro_id uuid not null references public.rubros(id) on delete cascade,
  primary key (proveedor_id, rubro_id)
);

alter table public.proveedor_rubros enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'proveedor_rubros' and policyname = 'autenticados') then
    create policy "autenticados" on public.proveedor_rubros for all to authenticated using (true) with check (true);
  end if;
end $$;

notify pgrst, 'reload schema';
