import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { canonicalStaffKey } from "../_shared/availability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SubmitBody = {
  staff_name?: string;
  lark_open_id?: string | null;
  week_start?: string;
  availability_text?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders });
  }

  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: corsHeaders });
  }

  const staffName = String(body.staff_name || "").trim();
  const openId = String(body.lark_open_id || "").trim() || null;
  const weekStart = String(body.week_start || "").trim();
  const availabilityText = String(body.availability_text || "").trim();
  if (!staffName || staffName.length > 120 || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || !availabilityText || availabilityText.length > 4000) {
    return Response.json({ error: "invalid_payload" }, { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: existing, error: readError } = await supabase
    .from("availability_submissions")
    .select("id,staff_name,lark_open_id")
    .eq("week_start", weekStart);

  if (readError) return Response.json({ error: "read_failed" }, { status: 500, headers: corsHeaders });

  const staffKey = canonicalStaffKey(staffName);
  const idsToDelete = (existing || [])
    .filter((row) => {
      if (openId && String(row.lark_open_id || "").trim() === openId) return true;
      return !openId && canonicalStaffKey(String(row.staff_name || "")) === staffKey;
    })
    .map((row) => row.id)
    .filter(Boolean);

  if (idsToDelete.length) {
    const { error: deleteError } = await supabase
      .from("availability_submissions")
      .delete()
      .in("id", idsToDelete);
    if (deleteError) return Response.json({ error: "replace_failed" }, { status: 500, headers: corsHeaders });
  }

  const { data, error: insertError } = await supabase
    .from("availability_submissions")
    .insert({
      staff_name: staffName,
      lark_open_id: openId,
      week_start: weekStart,
      availability_text: availabilityText,
    })
    .select("id,created_at")
    .single();

  if (insertError) return Response.json({ error: "insert_failed" }, { status: 500, headers: corsHeaders });
  return Response.json({ ok: true, id: data.id, created_at: data.created_at }, { headers: corsHeaders });
});
