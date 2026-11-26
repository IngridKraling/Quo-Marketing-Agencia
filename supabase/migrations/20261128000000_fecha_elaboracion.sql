-- Fecha de elaboración del presupuesto (la que se ve en el presupuesto para el cliente).
-- Los presupuestos existentes toman la fecha en que se crearon (hora de Argentina).
alter table public.presupuestos
  add column fecha_elaboracion date not null default (now() at time zone 'America/Argentina/Buenos_Aires')::date;

update public.presupuestos
set fecha_elaboracion = (created_at at time zone 'America/Argentina/Buenos_Aires')::date;
