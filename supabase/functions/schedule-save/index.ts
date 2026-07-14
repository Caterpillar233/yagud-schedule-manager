import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SaveBody = {
  id?: string;
  payload?: unknown;
  expected_updated_at?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return Response.json({ error: "method_not_allowed" }, { status: 405, headers: corsHeaders });
  }

  let body: SaveBody;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400, headers: corsHeaders });
  }

  const id = body.id || "main";
  if (id !== "main" || !body.payload || typeof body.payload !== "object") {
    return Response.json({ error: "invalid_payload" }, { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: current, error: readError } = await supabase
    .from("schedules")
    .select("payload,updated_at")
    .eq("id", id)
    .maybeSingle();

  if (readError) {
    return Response.json({ error: "read_failed" }, { status: 500, headers: corsHeaders });
  }

  if (current?.updated_at && body.expected_updated_at && current.updated_at !== body.expected_updated_at) {
    return Response.json(
      {
        error: "conflict",
        updated_at: current.updated_at,
        payload: current.payload,
      },
      { status: 409, headers: corsHeaders },
    );
  }

  const updatedAt = new Date().toISOString();
  const { error: writeError } = await supabase
    .from("schedules")
    .upsert({ id, payload: body.payload, updated_at: updatedAt }, { onConflict: "id" });

  if (writeError) {
    return Response.json({ error: "write_failed", message: writeError.message }, { status: 500, headers: corsHeaders });
  }

  return Response.json({ ok: true, updated_at: updatedAt }, { headers: corsHeaders });
});
