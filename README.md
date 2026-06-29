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
