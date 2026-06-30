grant select, insert, update, delete on public.lark_user_map to service_role;
grant select, insert, update, delete on public.lark_message_log to service_role;
grant select, insert, update, delete on public.lark_group_members to service_role;
grant usage, select on sequence public.lark_message_log_id_seq to service_role;
