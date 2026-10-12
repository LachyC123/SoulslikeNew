import { FAMILIES, hasAffix, Item } from './items';

export interface Loadout {
  weapons: [Item | null, Item | null];
  chest: Item | null;
  boots: Item | null;
  rings: [Item | null, Item | null];
}

export function loadoutItems(l: Loadout): Item[] {
  return [...l.weapons, l.chest, l.boots, ...l.rings].filter((i): i is Item => !!i);
}

const isFrostSource = (i: Item) => i.element === 'frost' || hasAffix(i, 'frostStep') > 0 || hasAffix(i, 'rimeHeart') > 0;
const isShatterSource = (i: Item) => i.family === 'hammer' || hasAffix(i, 'shatterer') > 0;
const isPoisonSource = (i: Item) => i.element === 'poison' || hasAffix(i, 'thorns') > 0;

/**
 * Plain-language explanations of how a candidate item connects to the rest of the build.
 * `others` are the items that would remain equipped alongside the candidate.
 */
export function synergiesFor(item: Item, others: Item[]): string[] {
  const out: string[] = [];
  const any = (pred: (i: Item) => boolean) => others.find(pred);

  if (isShatterSource(item)) {
    const frost = any(isFrostSource);
    const nova = any((i) => hasAffix(i, 'frostNova') > 0);
    if (nova) out.push(`Your ${nova.name} spreads frost when this shatters frozen foes.`);
    else if (frost && frost.slot === 'weapon') out.push(`Freeze foes with ${frost.name}, then swap and shatter them with this.`);
    else if (frost) out.push(`Your ${frost.name} chills foes; this weapon shatters them.`);
    if (item.element === 'frost' && !nova) out.push('This weapon both freezes and shatters on its own.');
  }
  if (item.element === 'frost' && !isShatterSource(item)) {
    const shat = any(isShatterSource);
    if (shat) out.push(`Frost from this sets up shatters for your ${shat.name}.`);
  }
  if (hasAffix(item, 'frostNova')) {
    const shat = any(isShatterSource);
    if (shat) out.push(`Your ${shat.name} shatters frozen foes; this ring spreads that frost onward.`);
    else out.push('Needs a shatter source: hammers shatter frozen foes.');
  }
  if (hasAffix(item, 'sporeBloom')) {
    const p = any(isPoisonSource);
    if (p) out.push(`Foes poisoned by ${p.name} burst into spores, infecting their neighbours.`);
    else out.push('Needs a poison source to trigger.');
  }
  if (item.element === 'poison') {
    const bloom = any((i) => hasAffix(i, 'sporeBloom') > 0);
    if (bloom) out.push(`Your ${bloom.name} turns poisoned kills into spreading spores.`);
    const venom = any((i) => hasAffix(i, 'venomHeart') > 0);
    if (venom) out.push(`Your ${venom.name} boosts this weapon's poison buildup.`);
  }
  if (hasAffix(item, 'venomHeart')) {
    const p = any((i) => i.element === 'poison');
    if (p) out.push(`Boosts the poison buildup of ${p.name}.`);
  }
  if (hasAffix(item, 'rimeHeart')) {
    const f = any((i) => i.element === 'frost');
    if (f) out.push(`Boosts the frost buildup of ${f.name}.`);
  }
  if (hasAffix(item, 'shadowEcho')) {
    const heavy = any((i) => i.family === 'hammer');
    out.push(heavy ? `Dodge, then strike: your shadow repeats even ${heavy.name}'s heavy blows.` : 'Dodge, then strike: your shadow repeats the attack.');
  }
  if (item.family && FAMILIES[item.family].heavy) {
    const echo = any((i) => hasAffix(i, 'shadowEcho') > 0);
    if (echo) out.push(`Your ${echo.name} echoes these heavy impacts after a dodge.`);
  }
  if (hasAffix(item, 'frostStep')) {
    const shat = any(isShatterSource);
    if (shat) out.push(`Dodges chill foes; ${shat.name} can shatter them once frozen.`);
  }
  if (hasAffix(item, 'luckyStrike') || hasAffix(item, 'critChance')) {
    const c = any((i) => hasAffix(i, 'critChance') > 0 || hasAffix(i, 'luckyStrike') > 0);
    if (c) out.push(`Stacks with the critical bonuses on ${c.name}.`);
  }
  if (item.family === 'daggers' && item.element !== 'none') out.push(`Rapid cuts build ${item.element} quickly.`);
  return [...new Set(out)].slice(0, 2);
}
