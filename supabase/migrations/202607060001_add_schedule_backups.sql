create table if not exists public.schedule_backups (
  id bigint generated always as identity primary key,
  schedule_id text not null,
  payload jsonb not null,
  backed_up_at timestamptz not null default now(),
  operation text not null check (operation in ('update', 'delete', 'manual'))
);

create index if not exists schedule_backups_schedule_id_backed_up_at_idx
  on public.schedule_backups (schedule_id, backed_up_at desc);

create or replace function public.backup_schedule_before_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.schedule_backups (schedule_id, payload, operation)
    values (old.id, old.payload, 'update');
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.schedule_backups (schedule_id, payload, operation)
    values (old.id, old.payload, 'delete');
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists schedules_backup_before_update on public.schedules;
create trigger schedules_backup_before_update
before update on public.schedules
for each row execute function public.backup_schedule_before_change();

drop trigger if exists schedules_backup_before_delete on public.schedules;
create trigger schedules_backup_before_delete
before delete on public.schedules
for each row execute function public.backup_schedule_before_change();

grant select, insert on public.schedule_backups to service_role;
