# Lark Integration Setup

This project uses Supabase Edge Functions as the backend for Lark.

## Features

- `lark-bot`: receives Lark bot messages and replies with the sender's own schedule.
- `lark-reminder`: sends a weekly availability reminder to one Lark group chat.

## Supabase Tables

Run `supabase/migrations/202606300001_lark_integration.sql` in Supabase SQL Editor.

Then map Lark users to schedule staff names:

```sql
insert into public.lark_user_map (lark_open_id, staff_name, display_name)
values
  ('ou_xxxxx', 'Vivian', 'Vivian')
on conflict (lark_open_id) do update
set staff_name = excluded.staff_name,
    display_name = excluded.display_name,
    updated_at = now();
```

## Required Supabase Function Secrets

Set these before deploying:

```text
LARK_APP_ID
LARK_APP_SECRET
LARK_VERIFICATION_TOKEN
LARK_REMINDER_CHAT_ID
CRON_SECRET
SERVICE_ROLE_KEY
```

`SUPABASE_URL` is normally available automatically inside Supabase Edge Functions.

## Lark App Settings

Create an internal Lark app with bot enabled.

Set the event callback URL to:

```text
https://<PROJECT_REF>.functions.supabase.co/lark-bot
```

Subscribe to message receive events for the bot.

Employees can send messages such as:

```text
查排班
查询本周排班
查询下周排班
```

To get the reminder group chat ID, add the bot to the target group and send:

```text
chat id
```

The bot will reply with the current `chat_id`. Put that value in `LARK_REMINDER_CHAT_ID`.

## Weekly Reminder

Deploy `lark-reminder`, then schedule a weekly HTTP call to:

```text
https://<PROJECT_REF>.functions.supabase.co/lark-reminder
```

Include this header:

```text
Authorization: Bearer <CRON_SECRET>
```

Supabase Scheduled Functions or an external scheduler can call this endpoint weekly.
