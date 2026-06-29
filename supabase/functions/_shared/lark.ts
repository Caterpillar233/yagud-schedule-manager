type LarkTokenResponse = {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
};

export type LarkReceiveIdType = "open_id" | "user_id" | "union_id" | "email" | "chat_id";

export async function getTenantAccessToken() {
  const appId = Deno.env.get("LARK_APP_ID");
  const appSecret = Deno.env.get("LARK_APP_SECRET");
  if (!appId || !appSecret) throw new Error("Missing LARK_APP_ID or LARK_APP_SECRET");

  const res = await fetch("https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const data = await res.json() as LarkTokenResponse;
  if (!res.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Unable to get Lark tenant token: ${JSON.stringify(data)}`);
  }
  return data.tenant_access_token;
}

export async function sendLarkText(receiveIdType: LarkReceiveIdType, receiveId: string, text: string) {
  return sendLarkMessage(receiveIdType, receiveId, "text", { text });
}

export async function sendLarkPost(receiveIdType: LarkReceiveIdType, receiveId: string, post: unknown) {
  return sendLarkMessage(receiveIdType, receiveId, "post", post);
}

export async function sendLarkMessage(receiveIdType: LarkReceiveIdType, receiveId: string, msgType: string, content: unknown) {
  const token = await getTenantAccessToken();
  const res = await fetch(`https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      receive_id: receiveId,
      msg_type: msgType,
      content: JSON.stringify(content),
    }),
  });
  const data = await res.json();
  if (!res.ok || data.code !== 0) {
    throw new Error(`Unable to send Lark message: ${JSON.stringify(data)}`);
  }
  return data;
}

export function verifyLarkToken(body: any) {
  const expected = Deno.env.get("LARK_VERIFICATION_TOKEN");
  if (!expected) return true;
  return body?.token === expected || body?.header?.token === expected;
}
