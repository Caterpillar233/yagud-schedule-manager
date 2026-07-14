drop policy if exists "insert main schedule" on public.schedules;
drop policy if exists "update main schedule" on public.schedules;

revoke insert, update, delete, truncate on public.schedules from anon;
revoke insert, update, delete, truncate on public.schedules from authenticated;

grant select on public.schedules to anon;
grant select on public.schedules to service_role;
grant insert, update, delete on public.schedules to service_role;
