import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { listLarkChatMembers, sendLarkPost, sendLarkText, verifyLarkToken } from "../_shared/lark.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SchedulePayload = {
  schedAll?: Record<string, Record<string, string | string[]>>;
  rooms?: Array<{ id: string; name?: string; nameZh?: string; daily?: boolean }>;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function slotLabel(slot: number) {
  const h = Math.floor(slot / 2);
  const m = (slot % 2) * 30;
  return `${pad(h)}:${pad(m)}`;
}

function slotEndLabel(slot: number) {
  return slotLabel((slot + 1) % 48);
}

function mondayOf(date: Date) {
  const d = new Date(date);
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function weekDates(nextWeek: boolean) {
  const start = mondayOf(new Date());
  if (nextWeek) start.setUTCDate(start.getUTCDate() + 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    return dateKey(d);
  });
}

function parseText(body: any) {
  const raw = body?.event?.message?.content;
  if (!raw) return "";
  try {
    const content = JSON.parse(raw);
    const text = content.text || "";
    return text.replace(/@\S+\s*/g, "").trim();
  } catch {
    return String(raw);
  }
}

function senderOpenId(body: any) {
  return body?.event?.sender?.sender_id?.open_id || "";
}

function operatorOpenId(body: any) {
  return body?.event?.operator?.operator_id?.open_id || body?.event?.operator_id?.open_id || "";
}

function chatId(body: any) {
  return body?.event?.message?.chat_id || "";
}

function eventKey(body: any) {
  return body?.event?.event_key || "";
}

function hasCommand(text: string, command: RegExp) {
  return command.test(text.replace(/\s+/g, " ").trim());
}

function normalizedText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function isAdminOpenId(openId: string) {
  const configured = (Deno.env.get("LARK_ADMIN_OPEN_IDS") || "ou_3b3c0c34dec3e95165735e45caa7ca14")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return configured.includes(openId);
}

function isMemberSyncCommand(text: string) {
  return /^(?:\/?list members|\/?sync members)$/i.test(normalizedText(text));
}

type ShiftSegment = {
  date: string;
  slot: number;
  end: number;
  len: number;
  role: string;
  room: string;
};

function weekdayLabel(date: string) {
  const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return labels[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

function hourText(slots: number) {
  const hours = slots * 0.5;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function roleLabel(role: string) {
  if (role === "host") return "Host";
  if (role === "coord") return "Mod";
  return "Daily";
}

function collectShiftSegments(payload: SchedulePayload, staffName: string, nextWeek: boolean) {
  const dates = new Set(weekDates(nextWeek));
  const rooms = payload.rooms || [];
  const schedAll = payload.schedAll || {};
  const items: Array<{ date: string; slot: number; role: string; room: string }> = [];

  for (const room of rooms) {
    const sc = schedAll[room.id] || {};
    const roomName = room.daily ? "Daily Work" : (room.name || room.nameZh || room.id);
    for (const [key, value] of Object.entries(sc)) {
      const parts = key.split("_");
      if (parts.length < 3 || !dates.has(parts[0])) continue;
      const slot = Number(parts[1]);
      const role = parts.slice(2).join("_");
      if (Number.isNaN(slot)) continue;
      if (Array.isArray(value)) {
        if (value.includes(staffName)) items.push({ date: parts[0], slot, role: "daily", room: roomName });
      } else if (value === staffName) {
        items.push({ date: parts[0], slot, role, room: roomName });
      }
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot || a.room.localeCompare(b.room));
  const segments: ShiftSegment[] = [];
  let i = 0;
  while (i < items.length) {
    const cur = items[i];
    let end = cur.slot;
    let j = i + 1;
    while (
      j < items.length &&
      items[j].date === cur.date &&
      items[j].slot === end + 1 &&
      items[j].role === cur.role &&
      items[j].room === cur.room
    ) {
      end = items[j].slot;
      j++;
    }
    segments.push({ date: cur.date, slot: cur.slot, end, len: end - cur.slot + 1, role: cur.role, room: cur.room });
    i = j;
  }
  return segments;
}

function buildSchedulePost(payload: SchedulePayload, staffName: string, nextWeek: boolean) {
  const segments = collectShiftSegments(payload, staffName, nextWeek);
  const title = `${staffName}'s Schedule ${nextWeek ? "Next Week" : "This Week"}`;
  const totalSlots = segments.reduce((sum, seg) => sum + seg.len, 0);
  const roles = Array.from(new Set(segments.map((seg) => roleLabel(seg.role))));
  const content: any[] = [
    [
      { tag: "text", text: staffName, style: ["bold"] },
      { tag: "text", text: roles.length ? `  ${roles.join(" / ")}` : "" },
      { tag: "text", text: `  ${hourText(totalSlots)}`, style: ["bold"] },
    ],
  ];

  if (!segments.length) {
    content.push([{ tag: "text", text: `No scheduled shifts ${nextWeek ? "next week" : "this week"}.` }]);
    content.push([{ tag: "text", text: "You can check again after the schedule is updated." }]);
  } else {
    for (const seg of segments) {
      const label = roleLabel(seg.role);
      content.push([
        { tag: "text", text: `${weekdayLabel(seg.date)} ${seg.date.slice(5)}  ` },
        { tag: "text", text: `[${label}]`, style: ["bold"] },
        { tag: "text", text: `  ${seg.room}  ${slotLabel(seg.slot)}-${slotEndLabel(seg.end)} (${hourText(seg.len)})` },
      ]);
    }
    content.push([
      { tag: "text", text: "Subtotal", style: ["bold"] },
      { tag: "text", text: `  ${hourText(totalSlots)}`, style: ["bold"] },
    ]);
  }
  return {
    en_us: {
      title,
      content,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const body = await req.json();
  if (body?.challenge) return Response.json({ challenge: body.challenge }, { headers: corsHeaders });
  if (!verifyLarkToken(body)) return new Response("Invalid token", { status: 401, headers: corsHeaders });

  const key = eventKey(body);
  const openId = senderOpenId(body) || operatorOpenId(body);
  const currentChatId = chatId(body);
  const isScheduleMenu = /^my_schedule$|^schedule_query$|schedule|shift/i.test(key);
  const text = isScheduleMenu ? "1" : parseText(body).trim();
  if (!openId) return Response.json({ ok: true }, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const logResult = await supabase.from("lark_message_log").insert({ lark_open_id: openId, message_text: key ? `menu:${key}` : text });

  if (hasCommand(text, /(?:^|\s)(chat\s*id|chat_id|群\s*id)(?:\s|$)/i) && currentChatId) {
    await sendLarkText("chat_id", currentChatId, `Current chat ID:\n${currentChatId}`);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }
  if (hasCommand(text, /(?:^|\s)(whoami|open\s*id|my\s*id)(?:\s|$)/i)) {
    await sendLarkText("open_id", openId, `Your Lark Open ID:\n${openId}`);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }
  if (isMemberSyncCommand(text) && currentChatId) {
    if (!isAdminOpenId(openId)) {
      await sendLarkText("open_id", openId, "This admin command is restricted.");
      return Response.json({ ok: true }, { headers: corsHeaders });
    }
    try {
      const members = await listLarkChatMembers(currentChatId);
      const rows = members
        .map((m) => ({
          chat_id: currentChatId,
          member_open_id: m.member_id || m.open_id || m.user_id || "",
          member_name: m.name || m.en_name || m.nickname || "",
          raw: m,
          last_seen_at: new Date().toISOString(),
        }))
        .filter((m) => m.member_open_id);
      if (rows.length) {
        await supabase.from("lark_group_members").upsert(rows, { onConflict: "chat_id,member_open_id" });
      }
      const preview = rows.slice(0, 30).map((m) => `${m.member_name || "(no name)"}: ${m.member_open_id}`);
      await sendLarkText(
        "open_id",
        openId,
        [`Found ${rows.length} members.`, ...preview, rows.length > 30 ? `...and ${rows.length - 30} more.` : ""]
          .filter(Boolean)
          .join("\n"),
      );
    } catch (e) {
      await sendLarkText("open_id", openId, `I couldn't read the group member list. Please check the app permission: im:chat.members:read.\n${String(e).slice(0, 500)}`);
    }
    return Response.json({ ok: true }, { headers: corsHeaders });
  }
  if (!/^1$|what'?s my schedule|schedule|shift/i.test(text)) {
    if (logResult.error) {
      console.error("lark_message_log insert failed", logResult.error);
    }
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  const { data: mapping, error: mapError } = await supabase
    .from("lark_user_map")
    .select("staff_name")
    .eq("lark_open_id", openId)
    .eq("active", true)
    .maybeSingle();

  if (mapError || !mapping?.staff_name) {
    await sendLarkText("open_id", openId, `Your Lark account is not linked to a schedule name yet. Please contact an admin.\nOpen ID: ${openId}`);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("payload")
    .eq("id", "main")
    .maybeSingle();

  if (scheduleError || !schedule?.payload) {
    await sendLarkText("open_id", openId, "I couldn't read the schedule data right now. Please try again later.");
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  const reply = buildSchedulePost(schedule.payload as SchedulePayload, mapping.staff_name, /next/i.test(text));
  await sendLarkPost("open_id", openId, reply);
  return Response.json({ ok: true }, { headers: corsHeaders });
});
