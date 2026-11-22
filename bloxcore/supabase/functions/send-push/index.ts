// Sends a Web Push notification to every device a user has subscribed on.
// Triggered internally by trg_push_on_notify (Postgres -> net.http_post). JWT verification is off because the
// caller is the database, not a browser — so instead the request must carry the shared secret in x-push-secret
// (stored in app_secrets as push_webhook_secret). Without it anyone could push arbitrary text/links to any user.
// DEPLOYED to the live project (version 2) on 2026-10-08 — keep this file in sync with the deployed function.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(supabaseUrl, serviceRoleKey);

Deno.serve(async (req) => {
  try {
    const { data: secrets } = await sb
      .from("app_secrets")
      .select("key, value")
      .in("key", ["vapid_public_key", "vapid_private_key", "push_webhook_secret"]);

    const expected = secrets?.find((s) => s.key === "push_webhook_secret")?.value;
    const provided = req.headers.get("x-push-secret");
    if (!expected || !provided || provided !== expected) {
      return new Response("unauthorized", { status: 401 });
    }

    const { user_id, title, body, url } = await req.json();
    if (!user_id) return new Response("missing user_id", { status: 400 });

    const { data: subs } = await sb
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (!subs || !subs.length) return new Response("no subscriptions", { status: 200 });

    const publicKey = secrets?.find((s) => s.key === "vapid_public_key")?.value;
    const privateKey = secrets?.find((s) => s.key === "vapid_private_key")?.value;
    if (!publicKey || !privateKey) return new Response("vapid keys not configured", { status: 500 });

    webpush.setVapidDetails("mailto:admin@blox.nexorealm.org", publicKey, privateKey);

    // Only same-site paths are allowed as the click target.
    const safeUrl = typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/";
    const payload = JSON.stringify({ title: title || "BloxCore", body: body || "", url: safeUrl });

    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
        ).catch(async (err) => {
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await sb.from("push_subscriptions").delete().eq("id", s.id);
          }
          throw err;
        }),
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    return new Response(JSON.stringify({ sent, total: subs.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push failed:", e);
    return new Response(String(e), { status: 500 });
  }
});
