create table if not exists public.lark_group_members (
  chat_id text not null,
  member_open_id text not null,
  member_name text,
  raw jsonb,
  last_seen_at timestamptz not null default now(),
  primary key (chat_id, member_open_id)
);

alter table public.lark_group_members enable row level security;

drop policy if exists "service role manages lark group members" on public.lark_group_members;

create policy "service role manages lark group members"
on public.lark_group_members
for all
to service_role
using (true)
with check (true);
