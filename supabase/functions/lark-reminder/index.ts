import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { sendLarkPost } from "../_shared/lark.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${cronSecret}`) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const chatId = Deno.env.get("LARK_REMINDER_CHAT_ID");
  if (!chatId) return new Response("Missing LARK_REMINDER_CHAT_ID", { status: 500, headers: corsHeaders });

  let body: any = {};
  try {
    body = req.method === "GET" ? {} : await req.json();
  } catch {
    body = {};
  }
  const isFinal = body.type === "final";
  const weekStart = nextMonday();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: people } = await supabase
    .from("lark_user_map")
    .select("staff_name,lark_open_id,display_name")
    .eq("active", true);
  const { data: submissions } = await supabase
    .from("availability_submissions")
    .select("staff_name")
    .eq("week_start", weekStart);
  const submitted = new Set((submissions || []).map((s) => String(s.staff_name || "").trim().toLowerCase()));
  const missing = (people || [])
    .filter((p) => p.staff_name && p.lark_open_id && !submitted.has(String(p.staff_name).trim().toLowerCase()))
    .sort((a, b) => String(a.staff_name).localeCompare(String(b.staff_name)));
  const reportUrl = `https://caterpillar233.github.io/yagud-schedule-manager/availability-report.html?week_start=${weekStart}`;
  const post = {
    en_us: {
      title: isFinal
        ? "Final Call: Next Week Availability Due Today at 5:00 PM"
        : "Reminder: Please Share Your Availability for Next Week",
      content: [
        [{
          tag: "text",
          text: isFinal
            ? "This is the final call to submit your availability for next week."
            : "Please reply in this group with your availability for next week.",
        }],
        [{ tag: "text", text: isFinal ? "Deadline: today at 5:00 PM." : "Deadline: Friday at 5:00 PM.", style: ["bold"] }],
        missing.length
          ? missing.map((p) => ({ tag: "at", user_id: p.lark_open_id, user_name: p.display_name || p.staff_name }))
          : [{ tag: "text", text: "Everyone has submitted. Thank you!" }],
        [{ tag: "text", text: "Suggested format:" }],
        [{ tag: "text", text: "Name + date + available time range" }],
        [{ tag: "text", text: "Example: Vivian 7/6 10:00-14:00, 7/8 12:00-18:00" }],
        [{ tag: "a", text: "View availability summary", href: reportUrl }],
        [{ tag: "text", text: "Thank you!" }],
      ],
    },
  };

  await sendLarkPost("chat_id", chatId, post);
  return Response.json({ ok: true }, { headers: corsHeaders });
});

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function dateKey(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function nextMonday() {
  const d = new Date();
  const day = d.getUTCDay();
  const add = day === 0 ? 1 : 8 - day;
  d.setUTCDate(d.getUTCDate() + add);
  d.setUTCHours(0, 0, 0, 0);
  return dateKey(d);
}
