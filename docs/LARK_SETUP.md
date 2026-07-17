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

Current production schedule:

- Thursday 9:00 AM Pacific: regular availability reminder.
- Friday 9:00 AM Pacific: regular availability reminder.
- Friday 5:00 PM Pacific: final call reminder.

Supabase Cron runs in UTC. The deployed schedules use Pacific daylight time conversion:

- `0 16 * * 4`
- `0 16 * * 5`
- `0 0 * * 6`

If the team needs exact 9:00 AM / 5:00 PM Pacific during standard time as well, update the cron expressions when daylight saving time changes or move scheduling to a timezone-aware external scheduler.

## Lark Event Callback

Use HTTP callback mode, not long connection mode, for Supabase Edge Functions.

Callback URL:

```text
https://gmfggasqezvcisfdckkj.functions.supabase.co/lark-bot
```

Add the `Receive Message v2.0` event:

```text
im.message.receive_v1
```

Do not enable encrypted event payloads unless the Edge Function is updated to decrypt them.

## Useful Bot Commands

- `What's my schedule` or `1`: reply with the sender's schedule.
- `whoami`: reply with the sender's Lark Open ID.
- `chat id`: reply with the current group chat ID.
- `list members` or `sync members`: admin-only command that pulls the current group member list, stores open IDs in Supabase, and sends the UID preview privately to the admin.
- Bot menu click with event key `schedule_query`: reply with the sender's schedule.

The `list members` command requires the bot to be in the group and the Lark permission:

```text
im:chat.members:read
```

## Bot Menu Configuration

In Lark Developer Console, configure the bot menu under the Bot feature.

Create a `My Schedule` menu item:

```text
Menu name: My Schedule
Action: Push event
Event key: my_schedule
```

When a user clicks this menu item, Lark sends a bot menu event to `lark-bot`; the function replies privately with that user's schedule as a rich text message.

For a shared Lark-authenticated web viewer link, use:

```text
https://gmfggasqezvcisfdckkj.functions.supabase.co/lark-auth
```

Add this exact redirect URL in Lark Developer Console security settings:

```text
https://gmfggasqezvcisfdckkj.functions.supabase.co/lark-auth
```

The function starts Lark OAuth, receives the logged-in user's `open_id`, then redirects to the personal schedule viewer.

Create an `Availability` menu item:

```text
Menu name: Availability
Action: Jump to link
Desktop URL: https://caterpillar233.github.io/yagud-schedule-manager/availability.html
Mobile URL: https://caterpillar233.github.io/yagud-schedule-manager/availability.html
```

This opens a form where employees can submit next week's available times.
