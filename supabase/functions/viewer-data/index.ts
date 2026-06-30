import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const openId = url.searchParams.get("open_id") || "";
  const staffParam = url.searchParams.get("staff") || "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let staffName = staffParam.trim();
  if (!staffName && openId) {
    const { data } = await supabase
      .from("lark_user_map")
      .select("staff_name")
      .eq("lark_open_id", openId)
      .eq("active", true)
      .maybeSingle();
    staffName = data?.staff_name || "";
  }

  if (!staffName) {
    return Response.json({ error: "not_linked" }, { status: 404, headers: corsHeaders });
  }

  const { data: schedule, error } = await supabase
    .from("schedules")
    .select("payload")
    .eq("id", "main")
    .maybeSingle();

  if (error || !schedule?.payload) {
    return Response.json({ error: "schedule_unavailable" }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ staffName, payload: schedule.payload }, { headers: corsHeaders });
});
