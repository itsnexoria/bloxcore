import { supabaseGet, rewriteMeta, escapeAttr } from '../_shared.js';

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  const refUsername = url.searchParams.get('ref');
  if (!refUsername) return response;

  const profile = await supabaseGet(
    `profiles?username=eq.${encodeURIComponent(refUsername)}&select=username,display_name,avatar_url,level`
  );
  if (!profile) return response;

  const name = profile.display_name || profile.username;
  const title = `${name} invited you to BloxCore!`;
  const description = `${name} is a Level ${profile.level} pirate on BloxCore, the #1 Blox Fruits community — trading, bounty hunting, crews, and more. Join with their link and you're both in.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description),
    image: profile.avatar_url || undefined,
    imageAlt: escapeAttr(`${name}'s avatar`),
    url: `https://bloxcores.com/auth/?ref=${encodeURIComponent(profile.username)}`,
  });
}
