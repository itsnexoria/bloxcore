import { supabaseGet, rewriteMeta, escapeAttr } from '../_shared.js';

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  const username = url.searchParams.get('u');
  if (!username) return response;

  const profile = await supabaseGet(
    `profiles?username=eq.${encodeURIComponent(username)}&select=username,display_name,avatar_url,level,status_line`
  );
  if (!profile) return response;

  const name = profile.display_name || profile.username;
  const title = `${name} (@${profile.username}) — Level ${profile.level} — BloxCore`;
  const description = profile.status_line
    ? `"${profile.status_line}" — Level ${profile.level} pirate on BloxCore, the #1 Blox Fruits community.`
    : `Level ${profile.level} pirate on BloxCore, the #1 Blox Fruits community. Check their quests, trades, and crew.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description),
    image: profile.avatar_url || undefined,
    imageAlt: escapeAttr(`${name}'s avatar`),
    url: `https://bloxcores.com/player/?u=${encodeURIComponent(profile.username)}`,
  });
}
