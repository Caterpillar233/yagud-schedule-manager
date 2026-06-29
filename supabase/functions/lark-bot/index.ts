import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendLarkText, verifyLarkToken } from "../_shared/lark.ts";

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
    return JSON.parse(raw).text || "";
  } catch {
    return String(raw);
  }
}

function senderOpenId(body: any) {
  return body?.event?.sender?.sender_id?.open_id || "";
}

function chatId(body: any) {
  return body?.event?.message?.chat_id || "";
}

function buildScheduleText(payload: SchedulePayload, staffName: string, nextWeek: boolean) {
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

  if (!items.length) {
    return `${staffName} ${nextWeek ? "下周" : "本周"}暂无排班。`;
  }

  items.sort((a, b) => a.date.localeCompare(b.date) || a.slot - b.slot || a.room.localeCompare(b.room));
  const lines = [`${staffName} ${nextWeek ? "下周" : "本周"}排班：`];
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
    const roleLabel = cur.role === "host" ? "主播" : cur.role === "coord" ? "场控" : "日常工作";
    lines.push(`${cur.date} ${slotLabel(cur.slot)}-${slotEndLabel(end)} ${cur.room} ${roleLabel}`);
    i = j;
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

  const body = await req.json();
  if (body?.challenge) return Response.json({ challenge: body.challenge }, { headers: corsHeaders });
  if (!verifyLarkToken(body)) return new Response("Invalid token", { status: 401, headers: corsHeaders });

  const openId = senderOpenId(body);
  const currentChatId = chatId(body);
  const text = parseText(body).trim();
  if (!openId) return Response.json({ ok: true }, { headers: corsHeaders });
  if (/^chat\s*id$|^群\s*id$|^chat_id$/i.test(text) && currentChatId) {
    await sendLarkText("chat_id", currentChatId, `当前群 Chat ID:\n${currentChatId}`);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }
  if (!/排班|schedule|shift|工时/i.test(text)) return Response.json({ ok: true }, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY")!,
  );

  await supabase.from("lark_message_log").insert({ lark_open_id: openId, message_text: text });

  const { data: mapping, error: mapError } = await supabase
    .from("lark_user_map")
    .select("staff_name")
    .eq("lark_open_id", openId)
    .eq("active", true)
    .maybeSingle();

  if (mapError || !mapping?.staff_name) {
    await sendLarkText("open_id", openId, `还没有绑定你的 Lark 账号和排班姓名，请联系管理员。\nOpen ID: ${openId}`);
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  const { data: schedule, error: scheduleError } = await supabase
    .from("schedules")
    .select("payload")
    .eq("id", "main")
    .maybeSingle();

  if (scheduleError || !schedule?.payload) {
    await sendLarkText("open_id", openId, "暂时没有读取到排班数据，请稍后再试。");
    return Response.json({ ok: true }, { headers: corsHeaders });
  }

  const reply = buildScheduleText(schedule.payload as SchedulePayload, mapping.staff_name, /下周|next/i.test(text));
  await sendLarkText("open_id", openId, reply);
  return Response.json({ ok: true }, { headers: corsHeaders });
});
