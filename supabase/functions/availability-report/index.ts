import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { latestSubmissionsOnly } from "../_shared/availability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const weekStart = url.searchParams.get("week_start") || nextMonday();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: submissions, error } = await supabase
    .from("availability_submissions")
    .select("id,staff_name,lark_open_id,week_start,availability_text,created_at")
    .eq("week_start", weekStart)
    .order("staff_name", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: "report_unavailable" }, { status: 500, headers: corsHeaders });

  return Response.json({ weekStart, submissions: latestSubmissionsOnly(submissions || []) }, { headers: corsHeaders });
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
