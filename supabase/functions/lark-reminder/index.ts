import { sendLarkText } from "../_shared/lark.ts";

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

  const text = [
    "请大家回复下周 available 时间。",
    "",
    "建议格式：",
    "姓名 + 日期 + 可用时间段",
    "例如：Vivian 7/6 10:00-14:00, 7/8 12:00-18:00",
    "",
    "请直接在本群回复，谢谢。",
  ].join("\n");

  await sendLarkText("chat_id", chatId, text);
  return Response.json({ ok: true }, { headers: corsHeaders });
});
