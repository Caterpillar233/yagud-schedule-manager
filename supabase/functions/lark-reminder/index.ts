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
        [{ tag: "text", text: "Suggested format:" }],
        [{ tag: "text", text: "Name + date + available time range" }],
        [{ tag: "text", text: "Example: Vivian 7/6 10:00-14:00, 7/8 12:00-18:00" }],
        [{ tag: "text", text: "Thank you!" }],
      ],
    },
  };

  await sendLarkPost("chat_id", chatId, post);
  return Response.json({ ok: true }, { headers: corsHeaders });
});
