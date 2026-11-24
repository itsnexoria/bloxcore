// Generates the evergreen content pages (run by the daily workflow, or by hand):
//   /blox-fruits-guides/                      guides hub
//   /blox-fruits-best-fruit-first-sea/        best fruit, levels 1-700
//   /blox-fruits-best-fruit-second-sea/       best fruit, levels 700-1500
//   /blox-fruits-best-fruit-third-sea/        best fruit, level 1500+
//   /blox-fruits-grinding-guide/              leveling / grinding how-to
//   /blox-fruits-raid-guide/                  raids + awakening how-to
//   /blox-fruits-is-it-worth-it/              how to judge a fruit + a verdict for every fruit
//   /blox-fruits-fruits/ -swords/ -guns/ -accessories/    one hub per category
//   /about/                                   editorial policy (linked from every guide's author block)
//
// Usage:  node scripts/generate-evergreen-guides.mjs [siteRoot] [items.json] [hubs.json]
// Without the JSON files it reads Supabase (needs network), exactly like the other generators.
// Game facts are deliberately evergreen (level ranges, how raids work); anything that changes with updates is
// pulled live from the database (value, demand, trend, rank) rather than hard-coded.
import fs from 'node:fs';
import path from 'node:path';
import { loadShell, renderPage, esc, slugify, formatValue, breadcrumbLd, ctaSectionHtml, adSlotTop, adSlotMiddle } from './lib/shell.mjs';
import { cap, rarityChip, trendChip, demandMeter, iconImg, faqAccordion, faqLd, crumbsHtml } from './lib/seo-ui.mjs';
import { SITE, authorBlock, articleLd, howToLd, stepsHtml, tocHtml, verdictFor, verdictChip, pickCard, setValueFormatter, relatedBlock, whyJoinStrip, giveawayStrip } from './lib/guide-ui.mjs';

const SUPABASE_URL = 'https://hpvwxaubgiyqgqtyjofb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_g14CxS8Kbu5hjGIpRGirQg_L5SY7ZWW';
const SITE_ROOT = process.argv[2] || '.';
const ITEMS_JSON = process.argv[3] || process.env.LOCAL_JSON || '';
const HUBS_JSON = process.argv[4] || process.env.LOCAL_HUBS || '';
const TODAY = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
const PUBLISHED = '2026-11-09';
const VALUE_SLUG_ALIAS = { magnet: 'magnet-fruit' };
setValueFormatter(formatValue);

async function rest(q) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
  if (!res.ok) throw new Error(`Supabase ${res.status} for ${q}`);
  return res.json();
}

function write(rel, html) {
  const dir = path.join(SITE_ROOT, rel);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), html);
}

// ---------------------------------------------------------------------------------------------- data
let items = ITEMS_JSON
  ? JSON.parse(fs.readFileSync(ITEMS_JSON, 'utf8'))
  : await rest('bf_items?select=id,name,category,rarity,regular_value,permanent_value,demand,trend,icon_url&category=in.(fruit,limited,gamepass)&regular_value=not.is.null');
items = items.filter(i => i.regular_value != null).map(i => (i.category === 'fruit' && i.name === 'Magnet' ? { ...i, name: 'Magnet Fruit' } : i));
const fruits = items.filter(i => i.category === 'fruit').sort((a, b) => b.regular_value - a.regular_value || a.name.localeCompare(b.name));
const rankOf = new Map(fruits.map(f => [f.id, fruits.filter(x => x.regular_value > f.regular_value).length + 1]));
const byName = new Map(items.map(i => [i.name.toLowerCase(), i]));
const get = n => byName.get(n.toLowerCase());

let hubs = HUBS_JSON ? JSON.parse(fs.readFileSync(HUBS_JSON, 'utf8')) : null;
if (!hubs) {
  const rows = await rest('bf_items?select=name,category,rarity,icon_url&category=in.(sword,gun,accessory)&order=name');
  hubs = { sword: [], gun: [], accessory: [] };
  for (const r of rows) hubs[r.category].push(r);
}

const valueSlug = name => { const s = slugify(name); return VALUE_SLUG_ALIAS[s] || s; };
const hrefFor = it => `/blox-fruits-values/${valueSlug(it.name)}/`;
const pairHref = (a, b) => {
  if (!a || !b) return null;
  for (const sl of [`${slugify(a.name)}-vs-${slugify(b.name)}`, `${slugify(b.name)}-vs-${slugify(a.name)}`]) {
    if (fs.existsSync(path.join(SITE_ROOT, 'blox-fruits-compare', sl))) return `/blox-fruits-compare/${sl}/`;
  }
  return null;
};
const UPDATE_NOTE = 'Values, demand and trends on this page are pulled from the BloxCore database and refreshed daily; the advice itself is evergreen, but game updates can shift the meta — check the tier list for the latest.';

// ---------------------------------------------------------------------------------------------- page frame
function guidePage({ slug, title, description, h1, lead, toc, sections, after = '', faq, steps, howTo, extraLd = [] }) {
  const url = `${SITE}/${slug}/`;
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Guides', url: `${SITE}/blox-fruits-guides/` }, { name: h1.replace(/\s*\(.*$/, ''), url }];
  if (slug === 'blox-fruits-guides') crumbs.splice(1, 1);
  const ld = [articleLd({ title, description, url, published: PUBLISHED, updated: TODAY }), breadcrumbLd(crumbs)];
  if (faq?.length) ld.push(faqLd(faq));
  if (howTo) ld.push(howToLd(howTo));
  ld.push(...extraLd);
  const body = `<section class="section seo-hero" style="padding-bottom:0;">
  <div class="container seo-wrap">
    ${crumbsHtml(crumbs)}
    <h1>${esc(h1)}</h1>
    <p class="seo-lead">${lead}</p>
    ${authorBlock({ updated: TODAY, published: PUBLISHED })}
  </div>
${adSlotTop()}
</section>
<main>
<section class="section">
  <div class="container seo-wrap seo-article">
    ${toc ? tocHtml(toc) : ''}
    ${sections}
    ${steps ? stepsHtml(steps) : ''}
    ${after}
    ${faq?.length ? `<h2 id="faq">Frequently asked questions</h2>${faqAccordion(faq)}` : ''}
    <p class="muted seo-note">${esc(UPDATE_NOTE)}</p>
    ${giveawayStrip()}
    ${relatedBlock({ skip: `/${slug}/` })}
  </div>
</section>
${ctaSectionHtml({ heading: 'Trade smarter with a free account', body: 'Get price alerts, build a watchlist and post listings — free, one tap with Discord.' })}
</main>`;
  write(slug, renderPage(SHELL, { title, description, url, ld, body }));
  return url;
}

const SHELL = loadShell(SITE_ROOT);
const urls = [];

const cards = (names, whys = {}) => `<div class="seo-picks">${names.map(n => { const it = get(n); return it ? pickCard(it, { rank: rankOf.get(it.id), total: fruits.length, why: whys[n], hrefFor }) : ''; }).join('')}</div>`;
const itemList = (names, name) => ({ '@context': 'https://schema.org', '@type': 'ItemList', name, itemListElement: names.map(n => get(n)).filter(Boolean).map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: `${SITE}${hrefFor(it)}` })) });
const link = n => { const it = get(n); return it ? `<a href="${hrefFor(it)}">${esc(it.name)}</a>` : esc(n); };
const h2h = (a, b) => { const h = pairHref(get(a), get(b)); return h ? `<li><a href="${h}">${esc(a)} vs ${esc(b)}</a></li>` : ''; };
const h2hList = pairs => { const li = pairs.map(([a, b]) => h2h(a, b)).join(''); return li ? `<p><b>Head-to-head comparisons:</b></p><ul class="seo-list">${li}</ul>` : ''; };
const valueNote = '<p class="muted">The numbers on each card are BloxCore trading data, not combat stats: <b>value</b> and <b>demand</b> show how a fruit trades, which matters when you buy or sell it. A cheap fruit can still be a great grinder — use the cards for cost and tradability, and the reasoning for how it plays.</p>';

// ---------------------------------------------------------------------------------------------- the three sea guides
urls.push(guidePage({
  slug: 'blox-fruits-best-fruit-first-sea',
  title: 'Best Blox Fruits for the First Sea (Levels 1–700) — Updated 2026 | BloxCore',
  description: 'The best fruits for the First Sea of Blox Fruits (levels 1–700): what to look for, top picks for beginners and budget options, with live BloxCore values and demand.',
  h1: 'Best Blox Fruits for the First Sea (Levels 1–700)',
  lead: 'The First Sea is where you learn the game, so the best fruit is one that is cheap to use, safe to level with and easy to sell later. Here is how to choose, plus our top picks with live trading data.',
  toc: [['what-matters', 'What matters in the First Sea'], ['top-picks', 'Top picks'], ['budget', 'Budget picks'], ['plan', 'Levels 1–700 at a glance'], ['faq', 'FAQ']],
  sections: `<h2 id="what-matters">What matters in the First Sea</h2>
    <p>The First Sea covers levels 1–700. Enemies are slow and weak, so the fruit that works best is the one that lets you kill groups quickly without taking damage. Three things decide that:</p>
    <ul class="seo-list"><li><b>Area damage.</b> Moves that hit several enemies at once shorten every quest.</li>
    <li><b>Survivability.</b> Elemental fruits such as ${link('Flame')}, ${link('Ice')}, ${link('Magma')} and ${link('Light')} can let you shrug off the basic attacks of enemies below your level, which makes early grinding far less painful.</li>
    <li><b>Cost and resale.</b> You will swap fruits a lot early on, so a fruit that holds some trade value is better than one nobody wants.</li></ul>
    ${valueNote}
    <h2 id="top-picks">Top picks for the First Sea</h2>
    ${cards(['Light', 'Magma', 'Flame', 'Ice', 'Buddha'], {
      Light: 'Fast, mobile and widely recommended as a first fruit; great for getting around as well as fighting.',
      Magma: 'Strong early damage that carries the First Sea and stays useful as you level.',
      Flame: 'A classic elemental pick with solid area damage and easy-to-learn moves.',
      Ice: 'An affordable elemental that is comfortable for early grinding.',
      Buddha: 'The all-rounder: a big, tanky form that keeps working in every sea if you can afford it.' })}
    ${h2hList([['Light', 'Magma'], ['Buddha', 'Magma'], ['Flame', 'Ice']])}
    <h2 id="budget">Budget picks</h2>
    <p>Short on Beli? A cheap fruit with wide hits is still a fine start. ${link('Bomb')} is a common budget grinder because its explosions catch groups, and ${link('Ice')} (above) is inexpensive for an elemental. Look for fruits with high demand but low value — they are easy to resell when you upgrade.</p>
    ${cards(['Bomb'], { Bomb: 'Very cheap, with explosions that hit groups — a solid early grinder.' })}
    <h2 id="plan">Levels 1–700 at a glance</h2>
    <ul class="seo-list"><li><b>Start:</b> take the quest closest to your level, kill the whole group, repeat — see the <a href="/blox-fruits-grinding-guide/">grinding guide</a>.</li>
    <li><b>Use 2x EXP codes</b> from our <a href="/blox-fruits-codes/">codes page</a> before long sessions.</li>
    <li><b>Around level 700</b> you fight the Ice Admiral to unlock the Second Sea — then read the <a href="/blox-fruits-best-fruit-second-sea/">Second Sea picks</a>.</li></ul>`,
  faq: [
    ['What is the best fruit for the First Sea?', 'There is no single answer, but Light, Magma and Buddha are the names that come up most. Light and Magma are strong and comparatively affordable; Buddha is the best all-rounder if you can pay for it, because it stays useful in every sea.'],
    ['What levels are the First Sea?', 'The First Sea covers roughly levels 1 to 700. At about level 700 you defeat the Ice Admiral to unlock the Second Sea.'],
    ['Is it worth buying a Mythical fruit this early?', 'Usually not just for grinding. Mythical fruits cost a lot and the First Sea does not need one — a cheaper elemental or Buddha levels you almost as fast. If you do own one, check its trading value before deciding to keep it.'],
    ['Should I trade for my first fruit?', 'It can be cheaper than buying it. Check the current value on BloxCore, compare a few offers, and use the trade calculator so you do not overpay.'],
  ],
  extraLd: [itemList(['Light', 'Magma', 'Flame', 'Ice', 'Buddha', 'Bomb'], 'Best fruits for the First Sea')],
}));

urls.push(guidePage({
  slug: 'blox-fruits-best-fruit-second-sea',
  title: 'Best Blox Fruits for the Second Sea (Levels 700–1500) — Updated 2026 | BloxCore',
  description: 'Which fruit to use in the Second Sea of Blox Fruits (levels 700–1500): top picks, why elemental fruits stop being enough, and when to start raids, with live values and demand.',
  h1: 'Best Blox Fruits for the Second Sea (Levels 700–1500)',
  lead: 'Enemies in the Second Sea hit harder and some use Haki, so the fruit that carried you through the First Sea may not be enough. Here is what to look for and the picks that hold up.',
  toc: [['what-changes', 'What changes in the Second Sea'], ['top-picks', 'Top picks'], ['raids', 'Raids and awakening'], ['faq', 'FAQ']],
  sections: `<h2 id="what-changes">What changes in the Second Sea</h2>
    <p>The Second Sea covers levels 700–1500. You unlock it by defeating the Ice Admiral at around level 700. Two things are different from the First Sea:</p>
    <ul class="seo-list"><li><b>Tougher enemies.</b> Many can ignore the free damage protection elemental fruits gave you before, so survivability matters more than ever.</li>
    <li><b>Raids unlock at level 1100.</b> Awakening your fruit becomes a real goal, so pick a fruit you plan to keep. Our <a href="/blox-fruits-raid-guide/">raid guide</a> walks through it.</li></ul>
    ${valueNote}
    <h2 id="top-picks">Top picks for the Second Sea</h2>
    ${cards(['Buddha', 'Phoenix', 'Magma', 'Light'], {
      Buddha: 'Still the standard grinding fruit: a large, tanky form with strong area damage.',
      Phoenix: 'Solid damage with built-in self-healing, which keeps long grinding sessions going.',
      Magma: 'A budget-friendly carry-over from the First Sea that still gets the job done.',
      Light: 'Fast and mobile; fine to keep using while you save for something stronger.' })}
    ${h2hList([['Buddha', 'Phoenix'], ['Buddha', 'Magma']])}
    <h2 id="raids">Raids and awakening</h2>
    <p>At level 1100 you can start raids in the Second Sea to earn Fragments and awaken your fruit. Not every fruit awakens, so check before you commit — the <a href="/blox-fruits-raid-guide/">raid guide</a> explains the requirements and how much it costs to start.</p>`,
  faq: [
    ['What is the best grinding fruit in the Second Sea?', 'Buddha is the most consistently recommended: its tanky form and area damage make long grinding sessions comfortable. Phoenix is a popular alternative because it can heal while you fight.'],
    ['What levels are the Second Sea?', 'Levels 700–1500. You unlock it by defeating the Ice Admiral at around level 700.'],
    ['When can I start raids?', 'At level 1100 you can start raids in the Second Sea. See the raid guide for what you need.'],
    ['Do elemental fruits still work in the Second Sea?', 'They are still playable, but many enemies here can break the protection elemental fruits gave you in the First Sea, so tankier fruits like Buddha or Phoenix are more comfortable.'],
  ],
  extraLd: [itemList(['Buddha', 'Phoenix', 'Magma', 'Light'], 'Best fruits for the Second Sea')],
}));

urls.push(guidePage({
  slug: 'blox-fruits-best-fruit-third-sea',
  title: 'Best Blox Fruits for the Third Sea (Level 1500+) — Updated 2026 | BloxCore',
  description: 'Which fruit to use in the Third Sea of Blox Fruits (level 1500+): top picks for grinding and bosses, what to check before you buy, with live BloxCore values and demand.',
  h1: 'Best Blox Fruits for the Third Sea (Level 1500+)',
  lead: 'The Third Sea is the endgame, and the fruit meta shifts with updates. This guide gives you the picks that keep coming up and shows how each one trades today so you do not overpay.',
  toc: [['what-changes', 'What changes in the Third Sea'], ['top-picks', 'Top picks'], ['before-you-buy', 'Before you buy'], ['faq', 'FAQ']],
  sections: `<h2 id="what-changes">What changes in the Third Sea</h2>
    <p>The Third Sea opens at level 1500, after you finish the Second Sea's final quest. Enemies come in large groups and bosses are tougher, so area damage and a way to survive hits matter more than raw single-target damage.</p>
    ${valueNote}
    <h2 id="top-picks">Top picks for the Third Sea</h2>
    ${cards(['Buddha', 'Dough', 'East Dragon', 'West Dragon', 'T-Rex', 'Kitsune', 'Venom'], {
      Buddha: 'Still a top grinder at this stage: durable, with reliable area damage.',
      Dough: 'A popular choice once awakened, with strong combos and good area control.',
      'East Dragon': 'A transformation with wide area damage that clears groups well.',
      'West Dragon': 'The other Dragon form — strong area damage; compare it with East Dragon before buying.',
      'T-Rex': 'Often recommended for tanky grinding and bosses.',
      Kitsune: 'A mobile, popular endgame fruit — check its current value before you buy.',
      Venom: 'A fruit people grind and fight with — check demand and value first.' })}
    ${h2hList([['Kitsune', 'Dough'], ['Buddha', 'Dough'], ['T-Rex', 'Kitsune']])}
    <h2 id="before-you-buy">Before you buy a Third Sea fruit</h2>
    <ul class="seo-list"><li><b>Check the trend.</b> A fruit marked "overpaid" costs more than it usually does — wait or trade for it instead. See the <a href="/blox-fruits-tier-list/">value tier list</a>.</li>
    <li><b>Decide if you will awaken it.</b> Raids are covered in the <a href="/blox-fruits-raid-guide/">raid guide</a>.</li>
    <li><b>Ask whether it is worth it.</b> Our <a href="/blox-fruits-is-it-worth-it/">worth-it guide</a> gives a quick verdict for every fruit.</li></ul>`,
  faq: [
    ['What is the best fruit for the Third Sea?', 'It depends on whether you grind, fight bosses or PvP. Buddha, Dough, Dragon, T-Rex and Kitsune are the names that come up most; the picks above show how each one trades today so you can balance power against price.'],
    ['What level is the Third Sea?', 'It opens at level 1500, once you have completed the Second Sea\'s final quest.'],
    ['Does the best fruit change with updates?', 'Yes. Updates add and rebalance fruits, which also moves their trading value. The picks here lean on fruits that have stayed useful, and the numbers on each card are refreshed daily.'],
    ['Is it better to buy or trade for a Third Sea fruit?', 'Trading is often cheaper. Check the live value, compare listings on the trading board and run the offer through the calculator.'],
  ],
  extraLd: [itemList(['Buddha', 'Dough', 'East Dragon', 'West Dragon', 'T-Rex', 'Kitsune', 'Venom'], 'Best fruits for the Third Sea')],
}));

// ---------------------------------------------------------------------------------------------- grinding guide (HowTo)
const grindSteps = [
  { name: 'Pick a grinding fruit', text: 'Choose a fruit with area damage and survivability for your sea — see the First, Second and Third Sea guides. Do not overspend: you will swap fruits as you level.' },
  { name: 'Redeem the latest codes', text: 'Redeem working codes (including 2x EXP) from the codes page before a long session, and keep an eye on the timer so you use it while grinding.' },
  { name: 'Take quests in your level range', text: 'Always grab the quest closest to your level, defeat the whole group and turn it in. Moving up as soon as a higher quest is available keeps experience per kill high.' },
  { name: 'Kill in groups', text: 'Pull several enemies together and use area moves. Bosses and boss quests give a large experience bump when you are in range.' },
  { name: 'Change servers when it is empty', text: 'If enemies are not respawning or other players are farming the same spot, hop to a new server instead of waiting.' },
  { name: 'Move on at each sea milestone', text: 'At about level 700 unlock the Second Sea, and at 1500 the Third Sea. In the Second Sea, raids unlock at level 1100 for awakening.' },
];
urls.push(guidePage({
  slug: 'blox-fruits-grinding-guide',
  title: 'Blox Fruits Grinding & Leveling Guide: Level Up Fast (2026) | BloxCore',
  description: 'A step-by-step Blox Fruits leveling guide: pick a grinding fruit, use 2x EXP codes, follow the right quests for your level, and know when to move to the next sea.',
  h1: 'Blox Fruits Grinding & Leveling Guide',
  lead: 'Leveling fast in Blox Fruits comes down to a handful of habits: the right fruit, active experience boosts, the right quests and good server choices. Follow these six steps.',
  toc: [['how-it-works', 'How leveling works'], ['steps', 'Six steps to level faster'], ['fruits', 'Best fruit by sea'], ['faq', 'FAQ']],
  sections: `<h2 id="how-it-works">How leveling works</h2>
    <p>You level by defeating enemies and completing quests. The game is split into three seas with set level ranges: the <b>First Sea</b> (about levels 1–700), the <b>Second Sea</b> (700–1500) and the <b>Third Sea</b> (1500 and up). Quests in each sea are tuned to a level band, so using the quest closest to your level gives the best experience.</p>
    <h2 id="steps">Six steps to level faster</h2>`,
  steps: grindSteps,
  after: `<h2 id="fruits">Best fruit by sea</h2>
    <p>The best grinding fruit changes as you move up. Use the guide for the sea you are in:</p>
    <ul class="seo-list"><li><a href="/blox-fruits-best-fruit-first-sea/">First Sea (levels 1–700)</a> — ${link('Light')}, ${link('Magma')}, ${link('Buddha')}</li>
    <li><a href="/blox-fruits-best-fruit-second-sea/">Second Sea (700–1500)</a> — ${link('Buddha')}, ${link('Phoenix')}</li>
    <li><a href="/blox-fruits-best-fruit-third-sea/">Third Sea (1500+)</a> — ${link('Buddha')}, ${link('Dough')}, ${link('T-Rex')}</li></ul>
    <p>Ready for raids? At level 1100 read the <a href="/blox-fruits-raid-guide/">raid guide</a>. Not sure a fruit is worth buying? See the <a href="/blox-fruits-is-it-worth-it/">worth-it verdicts</a>.</p>`,
  howTo: { name: 'How to level up fast in Blox Fruits', description: 'A six-step routine for leveling quickly in Blox Fruits.', steps: grindSteps, totalTime: 'PT1H' },
  faq: [
    ['What is the fastest way to level in Blox Fruits?', 'Use an area-damage fruit, redeem 2x EXP codes, always take the quest closest to your level, and pull enemies in groups. Hop servers when yours is crowded or empty.'],
    ['What is the best fruit for grinding?', 'Buddha is the most widely recommended across all seas; Light and Magma are strong early, Phoenix is popular in the Second Sea, and Dragon and Dough show up in the Third Sea. See the sea-by-sea guides for current values.'],
    ['Where do I find working codes?', 'We keep a list of working Blox Fruits codes, including experience boosts, on our codes page.'],
    ['At what level do I unlock the next sea?', 'You unlock the Second Sea at about level 700 and the Third Sea at level 1500 (after the Second Sea\'s final quest).'],
  ],
}));

// ---------------------------------------------------------------------------------------------- raid guide (HowTo)
const raidSteps = [
  { name: 'Reach level 1100', text: 'Raids start at level 1100, in the Second Sea. Unlock the Second Sea first by defeating the Ice Admiral at around level 700.' },
  { name: 'Go to the raid lab', text: 'Travel to the raid laboratory in the Second Sea (the Hot and Cold area) and find the Mysterious Scientist.' },
  { name: 'Buy a Special Microchip', text: 'Buy a Special Microchip from the Mysterious Scientist. At the time of writing it costs 100,000 Beli or a physical fruit.' },
  { name: 'Equip the fruit you want to awaken', text: 'Hold the fruit you are raiding with, then use the microchip on the raid console to pick the raid type and start it.' },
  { name: 'Clear all five waves', text: 'Defeat the enemies on each island, move up the islands and finish the final wave. Bring friends — raids are much easier as a team.' },
  { name: 'Collect Fragments and awaken', text: 'Finishing a raid awards Fragments. Spend them with the Mysterious Entity to awaken your fruit, which unlocks stronger versions of its moves.' },
];
urls.push(guidePage({
  slug: 'blox-fruits-raid-guide',
  title: 'Blox Fruits Raid Guide: How to Start Raids & Awaken Fruits (2026) | BloxCore',
  description: 'How to start a raid in Blox Fruits: level requirement, where to buy the Special Microchip, how the five waves work, and how Fragments awaken your fruit.',
  h1: 'Blox Fruits Raid Guide: How to Start Raids and Awaken Fruits',
  lead: 'Raids are how you earn Fragments to awaken your fruit. Here is what you need, where to go and what to expect, in six steps.',
  toc: [['requirements', 'What you need'], ['steps', 'How to start a raid'], ['awakening', 'Awakening explained'], ['faq', 'FAQ']],
  sections: `<h2 id="requirements">What you need</h2>
    <ul class="seo-list"><li><b>Level 1100</b> and access to the Second Sea.</li>
    <li><b>A fruit that can be awakened.</b> Not every fruit can; check that yours is before you spend anything. Our <a href="/blox-fruits-is-it-worth-it/">worth-it guide</a> shows how each fruit trades if you are choosing one to raid with.</li>
    <li><b>A Special Microchip</b> from the Mysterious Scientist, and ideally a few teammates.</li></ul>
    <h2 id="steps">How to start a raid</h2>`,
  steps: raidSteps,
  after: `<h2 id="awakening">Awakening explained</h2>
    <p>Awakening upgrades the moves of a fruit that supports it. You earn <b>Fragments</b> from raids and spend them with the Mysterious Entity; once awakened, you can unlock the upgraded versions of each move. Plan on several raids, because the Fragment cost adds up.</p>
    <ul class="seo-list"><li>Check that your fruit can be awakened before you start.</li><li>Bring a team — it speeds up clears and makes the later waves safer.</li><li>Grinding levels first helps: see the <a href="/blox-fruits-grinding-guide/">grinding guide</a>.</li></ul>`,
  howTo: { name: 'How to start a raid in Blox Fruits', description: 'Six steps to start a raid and earn Fragments for awakening.', steps: raidSteps },
  faq: [
    ['What level do I need to start raids?', 'Level 1100, in the Second Sea.'],
    ['Where do I buy the raid microchip?', 'From the Mysterious Scientist in the Second Sea raid lab. At the time of writing it costs 100,000 Beli or a physical fruit; prices can change with updates.'],
    ['How many waves are in a raid?', 'Five waves, one per island.'],
    ['How do I awaken my fruit?', 'Earn Fragments by finishing raids, then speak to the Mysterious Entity to awaken the fruit you are holding. Awakened fruits unlock stronger versions of their moves.'],
    ['Can I do raids alone?', 'Yes, but they are much easier with teammates, especially later raids. You can find players in our Discord or on the services board.'],
  ],
}));

// ---------------------------------------------------------------------------------------------- is it worth it (data-driven verdicts)
const rows = fruits.map(f => { const v = verdictFor(f, rankOf.get(f.id), fruits.length); return { f, v, rank: rankOf.get(f.id) }; });
const tally = rows.reduce((m, r) => (m[r.v.label] = (m[r.v.label] || 0) + 1, m), {});
urls.push(guidePage({
  slug: 'blox-fruits-is-it-worth-it',
  title: 'Is This Blox Fruit Worth It? Quick Verdict for Every Fruit (2026) | BloxCore',
  description: 'A quick, data-driven verdict for every Blox Fruit — strong hold, easy to trade, overpaid, possible pickup or niche — plus the five questions to ask before you buy or trade a fruit.',
  h1: 'Is This Blox Fruit Worth It? A Verdict for Every Fruit',
  lead: 'Before you buy or trade a fruit, ask whether it will hold its price and whether you can sell it later. Here are the five questions to ask and a live verdict for every fruit.',
  toc: [['questions', 'Five questions to ask'], ['verdicts', 'Verdict for every fruit'], ['faq', 'FAQ']],
  sections: `<h2 id="questions">Five questions to ask before you buy</h2>
    <ol class="seo-list"><li><b>How high is demand?</b> High demand means you can resell it quickly.</li>
    <li><b>What is the trend?</b> Overpaid fruits cost more than usual; underpaid ones may be a good time to buy.</li>
    <li><b>How does it rank?</b> Higher-ranked fruits are bigger purchases — make sure they fit your goal.</li>
    <li><b>Is a permanent version worth the premium?</b> A permanent fruit never expires but costs several times more; check the <a href="/blox-fruits-permanent-fruit-calculator/">permanent fruit calculator</a>.</li>
    <li><b>Do you actually need it?</b> For grinding, a cheap fruit is often enough — see the guides for <a href="/blox-fruits-best-fruit-first-sea/">First Sea</a>, <a href="/blox-fruits-best-fruit-second-sea/">Second Sea</a> and <a href="/blox-fruits-best-fruit-third-sea/">Third Sea</a>.</li></ol>
    <p class="muted">Verdicts below describe how a fruit <i>trades</i> — they say nothing about combat strength. They are generated from the same value, demand and trend data as the <a href="/blox-fruits-tier-list/">tier list</a> and refresh daily. Summary: ${Object.entries(tally).map(([k, n]) => `${n} ${esc(k.toLowerCase())}`).join(', ')}.</p>
    <h2 id="verdicts">Verdict for every fruit</h2>
    <div class="seo-table-wrap"><table class="compare-table seo-compare seo-verdicts"><thead><tr><th>Fruit</th><th>Value</th><th>Demand</th><th>Verdict</th></tr></thead><tbody>
    ${rows.map(({ f, v, rank }) => `<tr><th scope="row"><a href="${hrefFor(f)}" class="seo-vt-name">${iconImg(f, 28, 'seo-mini')}<span>${esc(f.name)}<small>#${rank}</small></span></a></th><td>${formatValue(f.regular_value)}</td><td>${f.demand != null ? `${f.demand}/10 ${demandMeter(f.demand)}` : '—'}</td><td>${verdictChip(v)}</td></tr>`).join('')}
    </tbody></table></div>
    ${adSlotMiddle()}`,
  faq: [
    ['How do I know if a Blox Fruit is worth buying?', 'Look at demand, trend and rank. High demand and a stable or rising trend mean it is easy to resell and likely to hold its price. An "overpaid" trend means you are paying a premium.'],
    ['What does "overpaid" or "underpaid" mean?', 'Overpaid means a fruit is trading above what many consider fair value; underpaid means it is trading below. Both are community estimates, so confirm the going rate before you trade.'],
    ['Is a permanent fruit worth it?', 'A permanent fruit never expires and is worth several times a physical one. It makes sense if you will keep the fruit for a long time; use the permanent fruit calculator to see the premium for any fruit.'],
    ['Does a high value mean a fruit is the best to use?', 'No. Value reflects trading demand, not combat strength. Many players level with cheaper fruits and save expensive ones for trading.'],
  ],
}));

// ---------------------------------------------------------------------------------------------- category hubs
function hubPage({ slug, title, description, h1, lead, bodyMain, faq, extraLd = [] }) {
  const url = `${SITE}/${slug}/`;
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'Items', url: `${SITE}/blox-fruits-values/` }, { name: h1, url }];
  const ld = [{ '@context': 'https://schema.org', '@type': 'CollectionPage', name: title, description, url, isPartOf: { '@type': 'WebSite', name: 'BloxCore', url: `${SITE}/` } }, breadcrumbLd(crumbs), faqLd(faq), ...extraLd];
  const body = `<section class="section seo-hero" style="padding-bottom:0;">
  <div class="container seo-wrap seo-wide">
    ${crumbsHtml(crumbs)}
    <h1>${esc(h1)}</h1>
    <p class="seo-lead">${lead}</p>
    ${authorBlock({ updated: TODAY, published: PUBLISHED })}
  </div>
${adSlotTop()}
</section>
<main>
<section class="section">
  <div class="container seo-wrap seo-wide seo-article">
    ${bodyMain}
    <h2 id="faq">Frequently asked questions</h2>${faqAccordion(faq)}
    ${relatedBlock({ skip: `/${slug}/` })}
  </div>
</section>
${ctaSectionHtml({ heading: 'Track the items you care about', body: 'Free account: watchlist, price alerts and trade listings.' })}
</main>`;
  write(slug, renderPage(SHELL, { title, description, url, ld, body }));
  return url;
}

urls.push(hubPage({
  slug: 'blox-fruits-fruits',
  title: 'All Blox Fruits: Values, Demand & Trends for Every Fruit (2026) | BloxCore',
  description: `Every Blox Fruit ranked by trading value, with demand, trend and a quick worth-it verdict. ${fruits.length} fruits, refreshed daily.`,
  h1: 'All Blox Fruits: Values, Demand & Trends',
  lead: `All ${fruits.length} fruits ranked by physical value, with permanent value, demand, trend and a plain-language verdict. Click any fruit for its full history, rank and what it trades evenly with.`,
  bodyMain: `<div class="seo-aside-layout"><div>
    <div class="seo-table-wrap"><table class="compare-table seo-compare seo-verdicts"><thead><tr><th>#</th><th>Fruit</th><th>Value</th><th>Permanent</th><th>Demand</th><th>Trend</th></tr></thead><tbody>
    ${fruits.map(f => `<tr><td>${rankOf.get(f.id)}</td><th scope="row"><a href="${hrefFor(f)}" class="seo-vt-name">${iconImg(f, 28, 'seo-mini')}<span>${esc(f.name)}<small>${esc(f.rarity || '')}</small></span></a></th><td>${formatValue(f.regular_value)}</td><td>${f.permanent_value ? formatValue(f.permanent_value) : '—'}</td><td>${f.demand != null ? `${f.demand}/10` : '—'}</td><td>${trendChip(f.trend) || '—'}</td></tr>`).join('')}
    </tbody></table></div>
    </div><div class="seo-aside">${whyJoinStrip()}${giveawayStrip()}<nav class="seo-toc" aria-label="Guides"><b>Fruit guides</b><ul><li><a href="/blox-fruits-best-fruit-first-sea/">First Sea picks</a></li><li><a href="/blox-fruits-best-fruit-second-sea/">Second Sea picks</a></li><li><a href="/blox-fruits-best-fruit-third-sea/">Third Sea picks</a></li><li><a href="/blox-fruits-is-it-worth-it/">Worth-it verdicts</a></li><li><a href="/blox-fruits-tier-list/">Value tier list</a></li></ul></nav></div></div>
    <p class="muted">Values are community estimates in-game currency terms; see <a href="/about/">how we set values</a>.</p>`,
  faq: [
    ['How many fruits are there in Blox Fruits?', `BloxCore currently tracks values for ${fruits.length} fruits, from Common to Mythical, and the list grows with each update.`],
    ['Which fruit is worth the most?', `${fruits[0] ? `${fruits[0].name} currently has the highest physical value at ${formatValue(fruits[0].regular_value)}` : 'The highest-valued fruit is at the top of the table'}; the table above is sorted by value and refreshed daily.`],
    ['What is the difference between physical and permanent value?', 'A physical fruit is a normal fruit you can trade; a permanent fruit is unlocked for your account and is worth several times more because it cannot be lost or traded away.'],
    ['Where do the values come from?', 'They are community estimates built from trading activity, demand and votes, reviewed by the BloxCore team. Read how we set values on our About page.'],
  ],
}));

const GALLERY = {
  sword: { slug: 'blox-fruits-swords', noun: 'sword', plural: 'swords', h1: 'All Blox Fruits Swords by Rarity', lead: 'Every sword in Blox Fruits, grouped from Mythical down to Common. Swords are not traded the way fruits are, so BloxCore catalogues them by rarity; use the fruit pages for trading values.' },
  gun: { slug: 'blox-fruits-guns', noun: 'gun', plural: 'guns', h1: 'All Blox Fruits Guns by Rarity', lead: 'Every gun in Blox Fruits, grouped from Mythical down to Common. Pair a gun with a fruit that suits your playstyle — the fruit guides show how each fruit trades.' },
  accessory: { slug: 'blox-fruits-accessories', noun: 'accessory', plural: 'accessories', h1: 'All Blox Fruits Accessories by Rarity', lead: 'Every accessory in Blox Fruits — hats, capes, masks and more — grouped from Mythical down to Common.' },
};
const RARITY_ORDER = ['Mythical', 'Legendary', 'Rare', 'Uncommon', 'Common'];
for (const [cat, g] of Object.entries(GALLERY)) {
  const list = hubs[cat] || [];
  const groups = RARITY_ORDER.map(r => [r, list.filter(x => (x.rarity || '') === r)]).filter(([, a]) => a.length);
  urls.push(hubPage({
    slug: g.slug,
    title: `All Blox Fruits ${cap(g.plural)}: Full List by Rarity (2026) | BloxCore`,
    description: `The complete list of ${list.length} Blox Fruits ${g.plural}, grouped by rarity from Mythical to Common.`,
    h1: g.h1,
    lead: g.lead,
    bodyMain: `<p class="seo-lead-2">${list.length} ${g.plural} in total: ${groups.map(([r, a]) => `${a.length} ${r.toLowerCase()}`).join(', ')}.</p>
    ${whyJoinStrip({ compact: true })}
    ${giveawayStrip()}
    ${groups.map(([r, a]) => `<h2 id="${r.toLowerCase()}">${r} ${g.plural} (${a.length})</h2><div class="seo-gallery">${a.map(x => `<span class="seo-gal-item">${x.icon_url ? iconImg(x, 36, 'seo-mini') : ''}<span>${esc(x.name)}</span></span>`).join('')}</div>`).join('')}`,
    faq: [
      [`How many ${g.plural} are in Blox Fruits?`, `BloxCore lists ${list.length} ${g.plural}, from Common to Mythical. New ones are added with game updates.`],
      [`What do the rarities mean for ${g.plural}?`, 'Rarity runs Common, Uncommon, Rare, Legendary and Mythical. Mythical items are the hardest to get and usually the strongest or most sought-after.'],
      [`Are ${g.plural} tradable on BloxCore?`, 'BloxCore tracks live trading values for fruits, limited items and gamepasses — the things players trade most. This page catalogues ' + g.plural + ' by rarity.'],
      ['Where can I see item values?', 'Open the all-fruits table or the value tier list for live values, demand and trends.'],
    ],
  }));
}

// ---------------------------------------------------------------------------------------------- guides hub + about
const GUIDE_CARDS = [
  ['/blox-fruits-best-fruit-first-sea/', 'Best fruit: First Sea', 'Levels 1–700. What to look for and the picks that work.'],
  ['/blox-fruits-best-fruit-second-sea/', 'Best fruit: Second Sea', 'Levels 700–1500. Picks that hold up against tougher enemies.'],
  ['/blox-fruits-best-fruit-third-sea/', 'Best fruit: Third Sea', 'Level 1500+. Endgame picks, with live values.'],
  ['/blox-fruits-grinding-guide/', 'Grinding & leveling guide', 'Six steps to level faster.'],
  ['/blox-fruits-raid-guide/', 'Raid & awakening guide', 'Requirements, the microchip and the five waves.'],
  ['/blox-fruits-is-it-worth-it/', 'Is this fruit worth it?', 'A live verdict for every fruit.'],
  ['/blox-fruits-trading-guide/', 'Trading guide', 'How to trade safely and fairly.'],
];
urls.push(guidePage({
  slug: 'blox-fruits-guides',
  title: 'Blox Fruits Guides: Best Fruits, Grinding, Raids & More (2026) | BloxCore',
  description: 'Evergreen Blox Fruits guides: best fruit for each sea, a leveling guide, raids and awakening, and a quick worth-it verdict for every fruit — with live trading values.',
  h1: 'Blox Fruits Guides',
  lead: 'Practical, evergreen guides for every stage of the game, written by the BloxCore team and backed by live trading data.',
  sections: `<div class="seo-guide-cards">${GUIDE_CARDS.map(([h, t, d]) => `<a class="panel seo-guide-card hover-lift-card" href="${h}"><b>${esc(t)}</b><span class="muted">${esc(d)}</span></a>`).join('')}</div>
    <h2>More on BloxCore</h2>
    <div class="seo-guide-cards">${[
      ['/blox-fruits-trading/', 'Trading', 'Find and post trades'], ['/blox-fruits-giveaways/', 'Giveaways', 'Reviewed giveaways with proof'], ['/blox-fruits-sea-events/', 'Sea events', 'Find people to run events with'],
      ['/blox-fruits-crews/', 'Crews', 'Join or start a crew'], ['/blox-fruits-leaderboards/', 'Leaderboards', 'Top players and crews'], ['/blox-fruits-bounties/', 'Bounties', 'Daily, weekly and monthly quests'],
      ['/blox-fruits-challenges/', 'Challenges', 'Earn XP and titles'], ['/blox-fruits-combos/', 'Combos', 'Share and learn combos'], ['/blox-fruits-codes/', 'Codes', 'Working Blox Fruits codes'],
      ['/blox-fruits-value-converter/', 'Value converter', 'Convert between values'], ['/blox-fruits-permanent-fruit-calculator/', 'Permanent fruit calculator', 'See the permanent premium'], ['/clips/', 'Clips', 'Community clips'],
      ['/build/', 'Build planner', 'Plan your stats'], ['/digest/', 'Weekly digest', 'What changed this week'], ['/status/', 'Site status', 'Is everything running?'], ['/discord/', 'Discord', 'Join the community'],
    ].filter(([h]) => fs.existsSync(path.join(SITE_ROOT, h.slice(1), 'index.html'))).map(([h, t, d]) => `<a class="panel seo-guide-card hover-lift-card" href="${h}"><b>${esc(t)}</b><span class="muted">${esc(d)}</span></a>`).join('')}</div>
    <h2>Browse by item type</h2>
    <p><a href="/blox-fruits-fruits/">All fruits</a> · <a href="/blox-fruits-swords/">Swords</a> · <a href="/blox-fruits-guns/">Guns</a> · <a href="/blox-fruits-accessories/">Accessories</a> · <a href="/blox-fruits-tier-list/">Value tier list</a> · <a href="/blox-fruits-compare/">Compare fruits</a></p>`,
  faq: [
    ['Are these guides up to date?', 'Each guide shows when it was last updated. The advice is evergreen, and the values, demand and trends are pulled from our database and refreshed daily.'],
    ['Who writes the guides?', 'The BloxCore team. Read how we make our guides and set values on the About page.'],
  ],
}));

{
  const title = 'About BloxCore — How We Set Values & Write Guides';
  const description = 'How BloxCore estimates Blox Fruits values, how often they refresh, who writes our guides and how to report a mistake.';
  const url = `${SITE}/about/`;
  const crumbs = [{ name: 'Home', url: `${SITE}/` }, { name: 'About', url }];
  const faq = [
    ['Is BloxCore affiliated with Roblox or Blox Fruits?', 'No. BloxCore is an independent fan community and is not affiliated with, endorsed by or sponsored by Roblox Corporation or the developers of Blox Fruits.'],
    ['How do I report a mistake in a guide or a value?', 'Tell us in the BloxCore Discord or use the report options on the site. We review reports and correct pages.'],
  ];
  const body = `<section class="section seo-hero" style="padding-bottom:0;"><div class="container seo-wrap">${crumbsHtml(crumbs)}<h1>About BloxCore</h1>
  <p class="seo-lead">BloxCore is a free community hub for Blox Fruits players: live item values, a trading board, giveaways, crews and guides. Here is how the numbers and the guides are made.</p>
  ${authorBlock({ updated: TODAY, published: PUBLISHED })}</div></section>
<main><section class="section"><div class="container seo-wrap seo-article">
  <h2>How we set values</h2>
  <p>Values are <b>community estimates</b>, not official prices. They are built from what players are actually trading, how much demand each item has, community votes on whether an item is overpaid, fair or underpaid, and review by the BloxCore team. Because the game changes, values can move after any update.</p>
  <h2>How often values refresh</h2>
  <p>The value pages, tier lists and comparisons are regenerated automatically every day from our database, and each page shows when it was last updated. The price history on an item page shows how its value has changed over time.</p>
  <h2>How we write guides</h2>
  <p>Guides are written by the BloxCore team. Where a guide states a game fact (level ranges, how raids work), we keep it evergreen and avoid numbers that change often; anything time-sensitive is pulled live from the database instead. Each guide shows the date it was last updated.</p>
  <h2>Disclosures</h2>
  <p>BloxCore is supported by advertising and may include affiliate links, which are labelled. We are an independent fan site and are not affiliated with Roblox or the Blox Fruits developers.</p>
  <h2>Contact and corrections</h2>
  <p>Spotted something wrong? Tell us in the <a href="/discord/">BloxCore Discord</a> and we will look into it.</p>
  <h2 id="faq">FAQ</h2>${faqAccordion(faq)}
  ${relatedBlock({})}
</div></section></main>`;
  write('about', renderPage(SHELL, { title, description, url, ld: [{ '@context': 'https://schema.org', '@type': 'AboutPage', name: title, description, url }, breadcrumbLd(crumbs), faqLd(faq)], body }));
  urls.push(url);
}

fs.writeFileSync(path.join(SITE_ROOT, 'evergreen-page-sitemap-urls.txt'), urls.join('\n') + '\n');
console.log(`Wrote ${urls.length} evergreen pages. URL list: evergreen-page-sitemap-urls.txt`);
