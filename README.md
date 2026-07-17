# Yagud Schedule Manager

Static weekly schedule manager for Yagud live operations.

## Online Database

This page is prepared for Supabase storage. Create a table with:

```sql
create table if not exists public.schedules (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
```

Then fill these values near the top of `index.html`:

```js
const ONLINE_DB={
  provider:'supabase',
  url:'https://YOUR_PROJECT.supabase.co',
  anonKey:'YOUR_SUPABASE_ANON_KEY',
  table:'schedules',
  id:'main'
};
```

Until those values are configured, the app keeps a local browser cache as a fallback.

## Lark Integration

Phase 2 backend scaffolding is in:

- `supabase/functions/lark-bot`: Lark message callback for personal schedule lookup.
- `supabase/functions/lark-reminder`: weekly availability reminder sender.
- `supabase/functions/availability-submit`: availability submission endpoint that replaces the employee's prior submission for the same week.
- `supabase/functions/availability-report`: availability summary API.
- `supabase/migrations/202606300001_lark_integration.sql`: Lark user mapping tables.
- `docs/LARK_SETUP.md`: setup steps and required secrets.
