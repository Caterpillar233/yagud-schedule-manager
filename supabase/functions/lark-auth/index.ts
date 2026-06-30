import { getAppAccessToken } from "../_shared/lark.ts";

const VIEWER_URL = "https://caterpillar233.github.io/yagud-schedule-manager/";
const LARK_AUTH_URL = "https://open.larksuite.com/open-apis/authen/v1/index";
const REDIRECT_URI = "https://gmfggasqezvcisfdckkj.functions.supabase.co/lark-auth";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const appId = Deno.env.get("LARK_APP_ID");

  if (!appId) return new Response("Missing LARK_APP_ID", { status: 500 });

  if (!code) {
    const authUrl = new URL(LARK_AUTH_URL);
    authUrl.searchParams.set("app_id", appId);
    authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.set("state", "schedule");
    return Response.redirect(authUrl.toString(), 302);
  }

  try {
    const appToken = await getAppAccessToken();
    const res = await fetch("https://open.larksuite.com/open-apis/authen/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
      }),
    });
    const data = await res.json();
    if (!res.ok || data.code !== 0 || !data.data?.open_id) {
      return new Response(`Lark auth failed: ${JSON.stringify(data)}`, { status: 500 });
    }

    const viewerUrl = new URL(VIEWER_URL);
    viewerUrl.searchParams.set("viewer", "1");
    viewerUrl.searchParams.set("open_id", data.data.open_id);
    return Response.redirect(viewerUrl.toString(), 302);
  } catch (e) {
    return new Response(`Lark auth failed: ${String(e)}`, { status: 500 });
  }
});
