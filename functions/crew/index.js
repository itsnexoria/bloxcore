import { supabaseGet, rewriteMeta, escapeAttr } from '../_shared.js';

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);
  const name = url.searchParams.get('name');
  if (!name) return response;

  const crew = await supabaseGet(
    `crews?name=eq.${encodeURIComponent(name)}&select=name,tag,description,logo_url,banner_url,crew_members(count)`
  );
  if (!crew) return response;

  const memberCount = crew.crew_members?.[0]?.count ?? 0;
  const title = `${crew.tag ? `[${crew.tag}] ` : ''}${crew.name} — BloxCore Crew`;
  const description = crew.description
    ? crew.description.slice(0, 160)
    : `${memberCount} member${memberCount === 1 ? '' : 's'} — a Blox Fruits crew on BloxCore.`;

  return rewriteMeta(response, {
    title: escapeAttr(title),
    description: escapeAttr(description),
    image: crew.banner_url || crew.logo_url || undefined,
    imageAlt: escapeAttr(`${crew.name} banner`),
    url: `https://bloxcores.com/crew/?name=${encodeURIComponent(crew.name)}`,
  });
}
