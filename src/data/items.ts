import { Rng } from '../core/rng';
import { EL_ADJ, Element, STATUS_ELS, StatusEl } from './elements';
import { Prop, propSig, propTags, propText, rollProps, RuleId, RULES } from './props';
import { ALL_FAMILIES, comboFor, FAMILIES, variantOf, WeaponFamily } from './weapons';

export type { WeaponFamily } from './weapons';
export { FAMILIES } from './weapons';
export type { Element } from './elements';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';
export type Slot = 'weapon' | 'chest' | 'boots' | 'ring' | 'relic';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'mythic'];
export const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', mythic: 'Mythic' };
/** Rarity is never colour-only: UI also shows label + border pattern + gem count. */
export const RARITY_GEMS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, mythic: 4 };
export const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', chest: 'Chest', boots: 'Boots', ring: 'Ring', relic: 'Relic' };

export type RelicId = 'blink' | 'nova' | 'meteor' | 'vortex' | 'spirits' | 'bubble' | 'timeslow' | 'storm' | 'turret' | 'quake' | 'warcry' | 'mirror';

export interface RelicSpec {
  ability: RelicId;
  el: Element;
  cooldown: number;
  power: number;
  count: number;
}

export interface Item {
  uid: string;
  slot: Slot;
  family?: WeaponFamily;
  variant?: number;
  name: string;
  rarity: Rarity;
  level: number;
  /** Weapons: damage per hit. */
  damage?: number;
  element: Element;
  /** Second element on rare dual-element weapons (buildup is split). */
  element2?: Element;
  buildup: number;
  defense?: number;
  props: Prop[];
  /** Visual seed so the inventory illustration depicts the same object as the world sprite. */
  look: number;
  mat?: number;
  relic?: RelicSpec;
  favourite?: boolean;
  price?: number;
}

// ---------------------------------------------------------------------------
// Materials (visual + naming vocabulary)

export interface Material {
  name: string;
  ramp: string[];
}
export const MATERIALS: Material[] = [
  { name: 'Steel', ramp: ['#4a5262', '#7d889a', '#b8c2d0', '#eef2f8'] },
  { name: 'Bronze', ramp: ['#5a3a1a', '#9a6a2a', '#d8a050', '#ffe0a0'] },
  { name: 'Blackiron', ramp: ['#1a1c24', '#353a46', '#5a6070', '#98a0b2'] },
  { name: 'Bone', ramp: ['#6a5a40', '#a8987a', '#d8ccb0', '#fff6e0'] },
  { name: 'Obsidian', ramp: ['#120a1a', '#2a1a3a', '#4a3a6a', '#9a8ac8'] },
  { name: 'Gilded', ramp: ['#6a4a1a', '#a87a2a', '#e0b04a', '#fff0a0'] },
  { name: 'Moonsilver', ramp: ['#4a5a7a', '#8aa0c8', '#c8d8f8', '#ffffff'] },
  { name: 'Verdigris', ramp: ['#1a4a3a', '#2a7a5a', '#5ab08a', '#a8e8c8'] },
  { name: 'Bloodsteel', ramp: ['#3a0a10', '#7a1a20', '#c03a3a', '#ff9a8a'] },
  { name: 'Jade', ramp: ['#0a3a2a', '#1a6a4a', '#3aa070', '#9af0c0'] },
  { name: 'Coral', ramp: ['#5a1a2a', '#a03a4a', '#e07a7a', '#ffd0c0'] },
  { name: 'Amber', ramp: ['#5a2a0a', '#a0581a', '#e0a03a', '#fff0b0'] },
];

// ---------------------------------------------------------------------------
// Name banks

const EL_WORDS: Record<Element, string[]> = {
  none: ['Wanderer', 'Old', 'Moss', 'Grey', 'Ruin', 'Oak', 'Hollow', 'Dusk', 'Pilgrim', 'Root', 'Stone', 'Lantern', 'Quiet', 'Tide'],
  poison: ['Briar', 'Thorn', 'Venom', 'Blight', 'Nettle', 'Rot', 'Viper', 'Mire', 'Hemlock', 'Toad', 'Spore', 'Gall'],
  frost: ['Winter', 'Rime', 'Frost', 'Glacier', 'Hoar', 'Snow', 'Sleet', 'Pale', 'Ice', 'Boreal', 'Floe', 'Chill'],
  burn: ['Ember', 'Cinder', 'Ash', 'Pyre', 'Flame', 'Brand', 'Kiln', 'Scorch', 'Sun', 'Magma', 'Char', 'Hearth'],
  shock: ['Storm', 'Thunder', 'Volt', 'Spark', 'Tempest', 'Static', 'Gale', 'Bolt', 'Squall', 'Arc', 'Fulgur', 'Skyfall'],
};
const COMPOUND = ['bite', 'fang', 'song', 'call', 'fall', 'mourn', 'wake', 'kiss', 'bane', 'heart', 'bloom', 'howl', 'crown', 'tooth', 'whisper', 'break', 'toll', 'thorn', 'shard', 'veil', 'spite', 'grin'];
const EPITHETS = [
  'the Drowned Choir',
  'Nine Winters',
  'the Ashen Orchard',
  'the Last Lantern',
  'Hollow Kings',
  'the Sunken Bell',
  'Quiet Thunder',
  'the Pale Stag',
  'the Rootmother',
  'Broken Oaths',
  'a Thousand Moths',
  'the Ember Saint',
  'Glass Rain',
  'the Verdant Crown',
  'Forgotten Tides',
  'the Weeping Star',
  'Moss and Marrow',
  'the Seventh Gate',
  'Bitter Spring',
  'the Gilded Wolf',
  'Unlit Halls',
  'the Storm Shepherd',
  'Patient Teeth',
  'the Crowned Fox',
  'Lost Pilgrims',
  'Silent Choirs',
  'the Hanging Garden',
  'Slow Fire',
  'the Lanternless',
  'Seven Sorrows',
  'the Under-Root',
  'Falling Petals',
];
const HEROES = ['Thessaly', 'Orrin', 'Vael', 'Mirrow', 'Kestrel', 'Sable', 'Ilvane', 'Corvin', 'Aster', 'Wren', 'Halcyon', 'Nerezza', 'Isolde', 'Brann', 'Oriel', 'Talwyn', 'Maren', 'Ysolt', 'Caddoc', 'Liesel'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Generation helpers

let uidCounter = 0;
export function newUid(rng: Rng): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${rng.nextU32().toString(36)}${uidCounter.toString(36)}`;
}

export function rollRarity(rng: Rng, level: number, bonus = 0): Rarity {
  const l = level + bonus;
  return rng.weighted<Rarity>([
    ['common', Math.max(6, 40 - l * 8)],
    ['uncommon', 32],
    ['rare', 14 + l * 4],
    ['epic', 4 + l * 3],
    ['mythic', l >= 2 ? 0.8 + l * 0.6 : 0.2],
  ]);
}

const QUALITY: Record<Rarity, [number, number]> = { common: [0.1, 0.3], uncommon: [0.25, 0.5], rare: [0.4, 0.7], epic: [0.6, 0.85], mythic: [0.8, 1] };
const RARITY_POWER: Record<Rarity, number> = { common: 1, uncommon: 1.06, rare: 1.13, epic: 1.22, mythic: 1.32 };

/** Familiarity function: higher = seen more often recently. Supplied by the game for anti-repetition. */
export type Familiarity = (sig: string) => number;
let familiarity: Familiarity = () => 0;
export function setFamiliarity(f: Familiarity): void {
  familiarity = f;
}

function propPlan(rarity: Rarity, r: Rng): { count: number; procs: number; conds: number; rule: boolean } {
  switch (rarity) {
    case 'common':
      return { count: 1, procs: 0, conds: 0, rule: false };
    case 'uncommon':
      return { count: 2, procs: r.chance(0.4) ? 1 : 0, conds: 0, rule: false };
    case 'rare':
      return { count: 3, procs: 1, conds: r.chance(0.4) ? 1 : 0, rule: false };
    case 'epic':
      return { count: 4, procs: r.chance(0.5) ? 2 : 1, conds: 1, rule: false };
    case 'mythic':
      return { count: 5, procs: 2, conds: 1, rule: true };
  }
}

export interface WeaponOpts {
  family?: WeaponFamily;
  variant?: number;
  element?: Element;
  rarity?: Rarity;
  name?: string;
  props?: Prop[];
}

export function makeWeapon(rng: Rng, level: number, opts: WeaponOpts = {}): Item {
  // Pick the least familiar of a few archetypes so families/variants rotate.
  let family = opts.family;
  let variant = opts.variant;
  if (!family) {
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const f = rng.pick(ALL_FAMILIES);
      const v = rng.int(0, 2);
      const s = familiarity(`w:${f}:${v}`) + familiarity(`f:${f}`) * 0.5 + rng.next() * 0.6;
      if (s < best) {
        best = s;
        family = f;
        variant = v;
      }
    }
  }
  family = family!;
  variant = variant ?? rng.int(0, 2);
  const rarity = opts.rarity ?? rollRarity(rng, level);
  const fam = FAMILIES[family];
  const element =
    opts.element ??
    rng.weighted<Element>([
      ['none', rarity === 'common' ? 4 : 1.5],
      ['poison', 2],
      ['frost', 2],
      ['burn', 2],
      ['shock', 2],
    ]);
  let element2: Element | undefined;
  if (element !== 'none' && (rarity === 'epic' || rarity === 'mythic') && rng.chance(0.35)) element2 = rng.pick(STATUS_ELS.filter((e) => e !== element));
  const q = rng.range(...QUALITY[rarity]);
  const levelMul = 1 + (level - 1) * 0.14;
  const damage = Math.max(1, Math.round(rng.range(fam.baseDamage[0], fam.baseDamage[1]) * levelMul * RARITY_POWER[rarity]));
  const buildup = element === 'none' ? 0 : Math.round(fam.baseBuild * rng.range(0.9, 1.3) * RARITY_POWER[rarity] * (element2 ? 0.7 : 1));
  const plan = propPlan(rarity, rng);
  const props =
    opts.props ??
    rollProps(rng, { slot: 'weapon', quality: q, level, count: Math.max(0, plan.count - 1), procs: plan.procs, conds: Math.min(plan.conds, 1), rule: plan.rule, element, ranged: fam.ranged, avoid: familiarity });
  const mat = rng.int(0, MATERIALS.length - 1);
  const name = opts.name ?? weaponName(rng, family, element, rarity, mat, props);
  return { uid: newUid(rng), slot: 'weapon', family, variant, name, rarity, level, damage, element, element2, buildup, props, look: rng.nextU32(), mat };
}

function weaponName(r: Rng, family: WeaponFamily, el: Element, rarity: Rarity, mat: number, props: Prop[]): string {
  const fam = FAMILIES[family];
  const noun = r.pick(fam.nouns);
  const elWord = r.pick(EL_WORDS[el]);
  if (rarity === 'mythic') {
    const rule = props.find((p) => p.k === 'rule') as { rule: RuleId } | undefined;
    const title = rule ? RULES[rule.rule].name : 'Undying';
    return `${r.pick(HEROES)}, the ${title} ${noun}`;
  }
  if (rarity === 'epic') return `${cap(elWord)}${r.pick(COMPOUND)} ${noun} of ${r.pick(EPITHETS)}`;
  if (rarity === 'rare' && r.chance(0.5)) return `${MATERIALS[mat].name} ${noun} of ${r.pick(EPITHETS)}`;
  if (r.chance(0.5)) return `${cap(elWord)}${r.pick(COMPOUND)}`;
  return `${r.chance(0.5) ? MATERIALS[mat].name : cap(elWord)} ${noun}`;
}

const RING_FORMS = ['Band', 'Loop', 'Signet', 'Coil', 'Ring', 'Circlet', 'Seal', 'Knot'];
const ARMOR_ADJ = ['Mossweave', 'Ruinwarden', 'Bramble', 'Lichen', 'Pilgrim', 'Ashen', 'Gilded', 'Rimebound', 'Stormhide', 'Rootwoven', 'Mothsilk', 'Copper', 'Thornhide', 'Riverstone', 'Owlfeather', 'Lanternlit', 'Saltworn', 'Hollowbark'];
const CHEST_NOUNS = ['Jerkin', 'Coat', 'Vest', 'Mail', 'Tunic', 'Cuirass', 'Robe', 'Brigandine', 'Harness', 'Mantle', 'Hauberk', 'Gambeson'];
const BOOT_NOUNS = ['Boots', 'Treads', 'Greaves', 'Striders', 'Walkers', 'Sabatons', 'Sandals', 'Wraps', 'Footguards', 'Runners'];

export function makeRing(rng: Rng, level: number, rarity?: Rarity, props?: Prop[]): Item {
  const r = rarity ?? rollRarity(rng, level, 1);
  const q = rng.range(...QUALITY[r]);
  const plan = propPlan(r, rng);
  const ps =
    props ??
    rollProps(rng, { slot: 'ring', quality: q, level, count: plan.count, procs: Math.max(1, plan.procs), conds: plan.conds, rule: plan.rule, avoid: familiarity });
  const lead = ps.find((p) => p.k === 'proc') ?? ps[0];
  const el = lead && lead.k === 'proc' ? lead.el : lead && lead.k === 'stat' && lead.el ? lead.el : 'none';
  const word = cap(rng.pick(EL_WORDS[el]));
  const name = r === 'mythic' ? `${rng.pick(HEROES)}'s ${rng.pick(RING_FORMS)}` : rng.chance(0.5) ? `${word} ${rng.pick(RING_FORMS)}` : `${rng.pick(RING_FORMS)} of ${rng.pick(EPITHETS)}`;
  return { uid: newUid(rng), slot: 'ring', name, rarity: r, level, element: el, buildup: 0, props: ps, look: rng.nextU32(), mat: rng.int(0, MATERIALS.length - 1) };
}

export function makeArmor(rng: Rng, level: number, slot: 'chest' | 'boots', rarity?: Rarity): Item {
  const r = rarity ?? rollRarity(rng, level);
  const q = rng.range(...QUALITY[r]);
  const plan = propPlan(r, rng);
  const props = rollProps(rng, { slot, quality: q, level, count: Math.max(1, plan.count), procs: plan.procs, conds: 0, rule: plan.rule, avoid: familiarity });
  const name = r === 'mythic' ? `${rng.pick(HEROES)}'s ${rng.pick(slot === 'chest' ? CHEST_NOUNS : BOOT_NOUNS)}` : `${rng.pick(ARMOR_ADJ)} ${rng.pick(slot === 'chest' ? CHEST_NOUNS : BOOT_NOUNS)}`;
  return {
    uid: newUid(rng),
    slot,
    name,
    rarity: r,
    level,
    element: 'none',
    buildup: 0,
    defense: slot === 'chest' ? Math.round(rng.range(2, 4) + level * 0.9 + RARITIES.indexOf(r)) : Math.round(rng.range(0, 2) + level * 0.4),
    props,
    look: rng.nextU32(),
  };
}

// ---------------------------------------------------------------------------
// Relics: an extra active ability.

export const RELICS: Record<RelicId, { name: string; nouns: string[]; cd: [number, number]; text: (s: RelicSpec) => string; elemental: boolean }> = {
  blink: { name: 'Blink', nouns: ['Feather', 'Mask', 'Mirror'], cd: [5, 8], elemental: true, text: (s) => `Blink forward, untouchable, and burst in ${EL_ADJ[s.el]} on arrival (${Math.round(s.power * 100)}%).` },
  nova: { name: 'Nova', nouns: ['Censer', 'Lantern', 'Bell'], cd: [8, 12], elemental: true, text: (s) => `Unleash a huge ${EL_ADJ[s.el]} nova around you (${Math.round(s.power * 100)}%).` },
  meteor: { name: 'Starfall', nouns: ['Star-Seed', 'Comet Shard', 'Orrery'], cd: [10, 14], elemental: true, text: (s) => `Call ${s.count} ${EL_ADJ[s.el]} meteors onto nearby foes (${Math.round(s.power * 100)}% each).` },
  vortex: { name: 'Vortex', nouns: ['Spiral Shell', 'Whirl Stone', 'Eye'], cd: [10, 14], elemental: true, text: (s) => `Open a ${EL_ADJ[s.el]} vortex that drags foes together for 2.5s.` },
  spirits: { name: 'Spirits', nouns: ['Totem', 'Idol', 'Fetish'], cd: [14, 18], elemental: true, text: (s) => `Summon ${s.count} ${EL_ADJ[s.el]} spirits that fight for 9s.` },
  bubble: { name: 'Bulwark', nouns: ['Shell', 'Ward', 'Aegis'], cd: [12, 16], elemental: false, text: (s) => `Gain a ${Math.round(s.power)}-point barrier for 8s.` },
  timeslow: { name: 'Stillness', nouns: ['Hourglass', 'Sundial', 'Pendulum'], cd: [14, 18], elemental: false, text: () => 'Slow all foes and their projectiles by 60% for 4s.' },
  storm: { name: 'Tempest', nouns: ['Horn', 'Rod', 'Banner'], cd: [12, 16], elemental: true, text: (s) => `Call ${s.count} ${EL_ADJ[s.el]} strikes onto foes over 3s (${Math.round(s.power * 100)}% each).` },
  turret: { name: 'Sentry', nouns: ['Seed', 'Acorn', 'Thornling Bulb'], cd: [12, 16], elemental: true, text: (s) => `Plant a sentry that fires ${EL_ADJ[s.el]} bolts for 9s.` },
  quake: { name: 'Quake', nouns: ['Drum', 'Anvil', 'Stone Heart'], cd: [9, 13], elemental: true, text: (s) => `Send out ${s.count} shockwaves that stagger and ${EL_ADJ[s.el]}-burn foes.` },
  warcry: { name: 'Warcry', nouns: ['Warhorn', 'Banner', 'Mask'], cd: [14, 18], elemental: false, text: (s) => `For 6s gain +${Math.round(s.power)}% damage and attack speed.` },
  mirror: { name: 'Mirror', nouns: ['Looking-Glass', 'Twin Mask', 'Shadow Lamp'], cd: [14, 18], elemental: false, text: (s) => `For 7s a shadow repeats every attack (${Math.round(s.power * 100)}%).` },
};

export function makeRelic(rng: Rng, level: number, rarity?: Rarity): Item {
  const r = rarity ?? rollRarity(rng, level, 1);
  const q = rng.range(...QUALITY[r]);
  let ability: RelicId = 'nova';
  let best = Infinity;
  for (let i = 0; i < 4; i++) {
    const a = rng.pick(Object.keys(RELICS) as RelicId[]);
    const s = familiarity(`relic:${a}`) + rng.next() * 0.6;
    if (s < best) {
      best = s;
      ability = a;
    }
  }
  const def = RELICS[ability];
  const el: Element = def.elemental ? rng.pick<Element>(['poison', 'frost', 'burn', 'shock', 'none']) : 'none';
  const cooldown = Math.round((def.cd[1] - (def.cd[1] - def.cd[0]) * q) * 10) / 10;
  let power = 1;
  let count = 1;
  if (ability === 'blink') power = 1.2 + q;
  else if (ability === 'nova') power = 2 + q * 1.5;
  else if (ability === 'meteor') {
    power = 2 + q;
    count = 3 + Math.round(q * 2);
  } else if (ability === 'spirits') count = 2 + Math.round(q * 2);
  else if (ability === 'bubble') power = 30 + q * 40 + level * 6;
  else if (ability === 'storm') {
    power = 1 + q * 0.8;
    count = 8 + Math.round(q * 6);
  } else if (ability === 'quake') {
    power = 1 + q;
    count = 2 + Math.round(q * 2);
  } else if (ability === 'warcry') power = 25 + q * 25;
  else if (ability === 'mirror') power = 0.4 + q * 0.3;
  else if (ability === 'vortex' || ability === 'turret') power = 0.5 + q * 0.4;
  const plan = propPlan(r, rng);
  const props = rollProps(rng, { slot: 'relic', quality: q, level, count: Math.max(0, plan.count - 2), procs: 0, conds: 0, rule: false, avoid: familiarity });
  const word = def.elemental && el !== 'none' ? cap(rng.pick(EL_WORDS[el])) : rng.pick(['Old', 'Pilgrim', 'Hollow', 'Gilded', 'Moss']);
  const name = r === 'mythic' ? `${rng.pick(HEROES)}'s ${rng.pick(def.nouns)}` : `${word} ${rng.pick(def.nouns)}`;
  return {
    uid: newUid(rng),
    slot: 'relic',
    name,
    rarity: r,
    level,
    element: el,
    buildup: 0,
    props,
    look: rng.nextU32(),
    relic: { ability, el, cooldown, power: Math.round(power * 100) / 100, count },
  };
}

export function relicText(i: Item): string {
  return i.relic ? RELICS[i.relic.ability].text(i.relic) : '';
}

export function starterWeapon(rng: Rng, family: WeaponFamily = 'sword'): Item {
  const names: Partial<Record<WeaponFamily, string>> = { sword: "Wanderer's Blade", daggers: 'Pilgrim Knives', hammer: "Mason's Maul", spear: 'Ferryman Pike', bow: 'Hunting Bow', wand: 'Hazel Wand' };
  const w = makeWeapon(rng, 1, { family, variant: 0, element: 'none', rarity: 'common', name: names[family] ?? `Old ${FAMILIES[family].nouns[0]}`, props: [] });
  w.damage = FAMILIES[family].baseDamage[0];
  w.mat = 0;
  return w;
}

export function randomLoot(rng: Rng, level: number, rarityBonus = 0): Item {
  const kind = rng.weighted<Slot>([
    ['weapon', 5],
    ['ring', 3],
    ['chest', 1.4],
    ['boots', 1.4],
    ['relic', 1.2],
  ]);
  const rarity = rollRarity(rng, level, rarityBonus + (kind === 'ring' || kind === 'relic' ? 0.5 : 0));
  if (kind === 'weapon') return makeWeapon(rng, level, { rarity });
  if (kind === 'ring') return makeRing(rng, level, rarity);
  if (kind === 'relic') return makeRelic(rng, level, rarity);
  return makeArmor(rng, level, kind, rarity);
}

// ---------------------------------------------------------------------------
// Derived numbers & text

export function itemSpeedMul(item: Item): number {
  const v = item.family ? variantOf(item.family, item.variant).speed : 1;
  let s = 0;
  for (const p of item.props) if (p.k === 'stat' && p.stat === 'atkSpd') s += p.value;
  return v * (1 + s / 100);
}

export function attackRate(item: Item): number {
  const combo = comboFor(item.family!, item.variant);
  const t = combo.reduce((s, c) => s + c.windup + c.active + c.recovery, 0) / itemSpeedMul(item);
  return combo.length / t;
}

export function sustainedDps(item: Item): number {
  const combo = comboFor(item.family!, item.variant);
  const t = combo.reduce((s, c) => s + c.windup + c.active + c.recovery, 0) / itemSpeedMul(item);
  const total = combo.reduce((s, c) => s + c.mul * (c.shot ? c.shot.count * (c.shot.returns ? 1.6 : 1) : 1), 0) * (item.damage ?? 0);
  let dmg = 0;
  for (const p of item.props) if (p.k === 'stat' && p.stat === 'dmg') dmg += p.value;
  return (total / t) * (1 + dmg / 100);
}

export function itemTags(item: Item): Set<string> {
  const tags = new Set<string>();
  if (item.element !== 'none') tags.add(item.element);
  if (item.element2) tags.add(item.element2);
  if (item.family && (FAMILIES[item.family].heavy || item.family === 'axe' || item.family === 'scythe')) tags.add('shatter');
  if (item.relic && item.relic.el !== 'none') tags.add(item.relic.el);
  for (const p of item.props) for (const t of propTags(p)) tags.add(t);
  return tags;
}

export function itemLines(item: Item): string[] {
  const lines: string[] = [];
  if (item.relic) lines.push(relicText(item));
  for (const p of item.props) lines.push(propText(p));
  return lines;
}

export function itemSig(item: Item): string[] {
  const s = item.props.map(propSig);
  if (item.family) s.push(`w:${item.family}:${item.variant ?? 0}`, `f:${item.family}`);
  if (item.relic) s.push(`relic:${item.relic.ability}`);
  if (item.element !== 'none') s.push(`el:${item.slot}:${item.element}`);
  return s;
}

export function salvageValue(item: Item): number {
  return 4 + RARITIES.indexOf(item.rarity) * 7 + item.level * 2;
}

export function itemPrice(item: Item): number {
  return Math.round((18 + RARITIES.indexOf(item.rarity) ** 2 * 16 + item.level * 6) * (item.slot === 'relic' ? 1.2 : 1));
}

export function familyLabel(item: Item): string {
  if (!item.family) return SLOT_LABEL[item.slot];
  const v = variantOf(item.family, item.variant);
  return `${v.label} ${FAMILIES[item.family].label}`;
}

export type { StatusEl };
