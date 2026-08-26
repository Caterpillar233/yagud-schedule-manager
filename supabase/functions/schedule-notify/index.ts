import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendLarkPost } from "../_shared/lark.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SchedulePayload = {
  schedAll?: Record<string, Record<string, string | string[]>>;
  rooms?: Array<{ id: string; name?: string; nameZh?: string; daily?: boolean }>;
};

type NotificationStatePayload = {
  last_notified_payload?: SchedulePayload;
  last_notified_schedule_updated_at?: string;
  last_notified_at?: string;
};

type ShiftChange = {
  type: "added" | "removed";
  staff: string;
  room: string;
  role: string;
  date: string;
  slot: number;
};

type Segment = ShiftChange & {
  end: number;
  len: number;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(slot: number) {
  const minutes = slot * 30;
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${pad(minute)} ${suffix}`;
}

function weekdayLabel(date: string) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function dateLabel(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return `${weekdayLabel(date)} ${month}/${day}`;
}

function roleLabel(role: string) {
  if (role === "host") return "Host";
  if (role === "coord") return "Mod";
  if (role === "daily") return "Daily Work";
  return role;
}

function roomName(payload: SchedulePayload, roomId: string) {
  const room = (payload.rooms || []).find((r) => r.id === roomId);
  if (!room) return roomId;
  if (room.daily) return "Daily Work";
  return room.name || room.nameZh || room.id;
}

function normalizeList(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  const text = String(value || "").trim();
  return text ? [text] : [];
}

function parseKey(key: string) {
  const parts = key.split("_");
  if (parts.length < 3) return null;
  const date = parts[0];
  const slot = Number(parts[1]);
  const role = parts.slice(2).join("_");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(slot)) return null;
  return { date, slot, role };
}

function collectChanges(oldPayload: SchedulePayload, newPayload: SchedulePayload) {
  const oldSched = oldPayload.schedAll || {};
  const newSched = newPayload.schedAll || {};
  const roomIds = new Set([...Object.keys(oldSched), ...Object.keys(newSched)]);
  const changes: ShiftChange[] = [];

  for (const roomId of roomIds) {
    const oldRoom = oldSched[roomId] || {};
    const newRoom = newSched[roomId] || {};
    const keys = new Set([...Object.keys(oldRoom), ...Object.keys(newRoom)]);
    for (const key of keys) {
      const parsed = parseKey(key);
      if (!parsed) continue;
      const oldNames = new Set(normalizeList(oldRoom[key]));
      const newNames = new Set(normalizeList(newRoom[key]));
      const role = Array.isArray(oldRoom[key]) || Array.isArray(newRoom[key]) ? "daily" : parsed.role;
      const room = roomName(newPayload, roomId);

      for (const staff of newNames) {
        if (!oldNames.has(staff)) changes.push({ type: "added", staff, room, role, date: parsed.date, slot: parsed.slot });
      }
      for (const staff of oldNames) {
        if (!newNames.has(staff)) changes.push({ type: "removed", staff, room, role, date: parsed.date, slot: parsed.slot });
      }
    }
  }

  return changes;
}

function segmentChanges(changes: ShiftChange[]) {
  const sorted = [...changes].sort((a, b) =>
    a.staff.localeCompare(b.staff) ||
    a.type.localeCompare(b.type) ||
    a.date.localeCompare(b.date) ||
    a.room.localeCompare(b.room) ||
    a.role.localeCompare(b.role) ||
    a.slot - b.slot
  );
  const segments: Segment[] = [];
  let i = 0;
  while (i < sorted.length) {
    const cur = sorted[i];
    let end = cur.slot;
    let j = i + 1;
    while (
      j < sorted.length &&
      sorted[j].staff === cur.staff &&
      sorted[j].type === cur.type &&
      sorted[j].date === cur.date &&
      sorted[j].room === cur.room &&
      sorted[j].role === cur.role &&
      sorted[j].slot === end + 1
    ) {
      end = sorted[j].slot;
      j++;
    }
    segments.push({ ...cur, end, len: end - cur.slot + 1 });
    i = j;
  }
  return segments;
}

function weekRange(payload: SchedulePayload) {
  const dates = new Set<string>();
  for (const room of Object.values(payload.schedAll || {})) {
    for (const key of Object.keys(room || {})) {
      const parsed = parseKey(key);
      if (parsed) dates.add(parsed.date);
    }
  }
  const sorted = [...dates].sort();
  if (!sorted.length) return "Schedule";
  return `${dateLabel(sorted[0])} - ${dateLabel(sorted[sorted.length - 1])}`;
}

function segmentText(seg: Segment) {
  return `${dateLabel(seg.date)} - ${formatTime(seg.slot)}-${formatTime(seg.end + 1)} - ${seg.room} - ${roleLabel(seg.role)}`;
}

function buildPost(staff: string, added: Segment[], removed: Segment[], openId: string, range: string) {
  const href = `https://caterpillar233.github.io/yagud-schedule-manager/?viewer=1&open_id=${encodeURIComponent(openId)}`;
  const content: any[] = [
    [{ tag: "text", text: `Hi ${staff}, your schedule has been updated.` }],
  ];

  if (added.length) {
    content.push([{ tag: "text", text: "Added shifts:", style: ["bold"] }]);
    for (const seg of added.slice(0, 20)) content.push([{ tag: "text", text: `+ ${segmentText(seg)}` }]);
    if (added.length > 20) content.push([{ tag: "text", text: `+ ${added.length - 20} more added shifts. Please check the full schedule.` }]);
  }

  if (removed.length) {
    content.push([{ tag: "text", text: "Removed shifts:", style: ["bold"] }]);
    for (const seg of removed.slice(0, 20)) content.push([{ tag: "text", text: `- ${segmentText(seg)}` }]);
    if (removed.length > 20) content.push([{ tag: "text", text: `- ${removed.length - 20} more removed shifts. Please check the full schedule.` }]);
  }

  content.push([{ tag: "a", text: "Check my Schedule", href }]);
  content.push([{ tag: "text", text: "Please contact the coordinator if anything looks incorrect." }]);

  return {
    en_us: {
      title: `Schedule Update: ${range}`,
      content,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("payload,updated_at")
    .eq("id", "main")
    .maybeSingle();

  if (scheduleError || !schedule?.payload) {
    return Response.json({ error: "schedule_unavailable" }, { status: 500, headers: corsHeaders });
  }

  const { data: state, error: stateError } = await supabase
    .from("schedules")
    .select("payload")
    .eq("id", "lark_notification_state")
    .maybeSingle();

  if (stateError) {
    return Response.json({ error: "state_read_failed", message: stateError.message }, { status: 500, headers: corsHeaders });
  }

  const now = new Date().toISOString();
  const lastState = (state?.payload || {}) as NotificationStatePayload;
  if (!lastState.last_notified_payload) {
    const { error: initError } = await supabase
      .from("schedules")
      .upsert({
        id: "lark_notification_state",
        payload: {
          last_notified_payload: schedule.payload,
          last_notified_schedule_updated_at: schedule.updated_at,
          last_notified_at: now,
        },
        updated_at: now,
      }, { onConflict: "id" });
    if (initError) {
      return Response.json({ error: "state_init_failed", message: initError.message }, { status: 500, headers: corsHeaders });
    }
    return Response.json({ ok: true, initialized: true, notified_staff_count: 0, added_count: 0, removed_count: 0, skipped_unmapped_staff: [] }, { headers: corsHeaders });
  }

  const changes = collectChanges(lastState.last_notified_payload as SchedulePayload, schedule.payload as SchedulePayload);
  const segments = segmentChanges(changes);
  const addedCount = changes.filter((c) => c.type === "added").length;
  const removedCount = changes.filter((c) => c.type === "removed").length;

  const { data: mappings, error: mapError } = await supabase
    .from("lark_user_map")
    .select("staff_name,lark_open_id,display_name")
    .eq("active", true);

  if (mapError) {
    return Response.json({ error: "mapping_read_failed", message: mapError.message }, { status: 500, headers: corsHeaders });
  }

  const mapByStaff = new Map<string, { openId: string; displayName: string }>();
  for (const row of mappings || []) {
    const staff = String(row.staff_name || "").trim();
    const openId = String(row.lark_open_id || "").trim();
    if (staff && openId) mapByStaff.set(staff.toLowerCase(), { openId, displayName: row.display_name || staff });
  }

  const byStaff = new Map<string, Segment[]>();
  for (const seg of segments) {
    if (!byStaff.has(seg.staff)) byStaff.set(seg.staff, []);
    byStaff.get(seg.staff)!.push(seg);
  }

  const skipped = new Set<string>();
  const failed: Array<{ staff: string; message: string }> = [];
  let notified = 0;
  const range = weekRange(schedule.payload as SchedulePayload);

  for (const [staff, staffSegments] of byStaff) {
    const mapping = mapByStaff.get(staff.trim().toLowerCase());
    if (!mapping) {
      skipped.add(staff);
      continue;
    }
    const added = staffSegments.filter((s) => s.type === "added");
    const removed = staffSegments.filter((s) => s.type === "removed");
    if (!added.length && !removed.length) continue;
    try {
      await sendLarkPost("open_id", mapping.openId, buildPost(mapping.displayName || staff, added, removed, mapping.openId, range));
      notified++;
    } catch (e) {
      failed.push({ staff, message: String(e).slice(0, 500) });
    }
  }

  if (!failed.length) {
    const { error: writeError } = await supabase
      .from("schedules")
      .upsert({
        id: "lark_notification_state",
        payload: {
          last_notified_payload: schedule.payload,
          last_notified_schedule_updated_at: schedule.updated_at,
          last_notified_at: now,
        },
        updated_at: now,
      }, { onConflict: "id" });
    if (writeError) {
      return Response.json({ error: "state_write_failed", message: writeError.message }, { status: 500, headers: corsHeaders });
    }
  }

  return Response.json({
    ok: !failed.length,
    notified_staff_count: notified,
    added_count: addedCount,
    removed_count: removedCount,
    skipped_unmapped_staff: [...skipped].sort(),
    failed,
  }, { status: failed.length ? 207 : 200, headers: corsHeaders });
});
