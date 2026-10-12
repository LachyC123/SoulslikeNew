import { Rng } from '../core/rng';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'mythic';
export type Slot = 'weapon' | 'chest' | 'boots' | 'ring';
export type WeaponFamily = 'sword' | 'daggers' | 'hammer';
export type Element = 'none' | 'poison' | 'frost';

export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'mythic'];
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  mythic: 'Mythic',
};
/** Rarity is never colour-only: UI also shows label + border pattern + gem count. */
export const RARITY_GEMS: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, mythic: 4 };

export type AffixId =
  // weapon
  | 'critChance'
  | 'swift'
  | 'keen'
  | 'shatterer'
  | 'reaper'
  | 'venomous'
  | 'rimed'
  // chest
  | 'vitality'
  | 'thorns'
  | 'warding'
  // boots
  | 'fleet'
  | 'quickstep'
  | 'frostStep'
  // rings
  | 'frostNova'
  | 'sporeBloom'
  | 'shadowEcho'
  | 'venomHeart'
  | 'rimeHeart'
  | 'bloodPrice'
  | 'luckyStrike';

export interface Affix {
  id: AffixId;
  value: number;
}

export interface Item {
  uid: string;
  slot: Slot;
  family?: WeaponFamily;
  name: string;
  rarity: Rarity;
  level: number;
  /** Weapons: damage per hit. */
  damage?: number;
  element: Element;
  /** Status buildup per hit (weapons). */
  buildup: number;
  /** Chest: defence; boots: unused. */
  defense?: number;
  affixes: Affix[];
  /** Visual seed so the inventory illustration depicts the same object as the world sprite. */
  look: number;
  favourite?: boolean;
}

// ---------------------------------------------------------------------------
// Weapon families: movesets are authored; rolls only scale within a budget.

export interface AttackStep {
  windup: number;
  active: number;
  recovery: number;
  /** Multiplier of the weapon's per-hit damage. */
  mul: number;
  /** Reach in px from player centre. */
  reach: number;
  /** Total arc in radians. */
  arc: number;
  /** Forward step during the active frames (px). */
  lunge: number;
  /** Poise damage → stagger. */
  poise: number;
  hitstop: number;
  shake: number;
  /** Swing direction, alternates for readable combos. */
  sweep: 1 | -1;
}

export interface FamilyDef {
  id: WeaponFamily;
  label: string;
  heavy: boolean;
  combo: AttackStep[];
  baseDamage: [number, number];
  skill: { id: string; name: string; cooldown: number; desc: string };
  /** Innate behaviour described in item cards. */
  innate: string;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const FAMILIES: Record<WeaponFamily, FamilyDef> = {
  sword: {
    id: 'sword',
    label: 'Sword',
    heavy: false,
    baseDamage: [11, 14],
    combo: [
      { windup: 0.07, active: 0.08, recovery: 0.2, mul: 1, reach: 24, arc: deg(130), lunge: 6, poise: 12, hitstop: 0.03, shake: 0.6, sweep: 1 },
      { windup: 0.07, active: 0.08, recovery: 0.2, mul: 1, reach: 24, arc: deg(130), lunge: 6, poise: 12, hitstop: 0.03, shake: 0.6, sweep: -1 },
      { windup: 0.12, active: 0.1, recovery: 0.32, mul: 1.5, reach: 27, arc: deg(170), lunge: 10, poise: 25, hitstop: 0.05, shake: 1.2, sweep: 1 },
    ],
    skill: { id: 'crescent', name: 'Travelling Crescent', cooldown: 5, desc: 'Launch a piercing crescent wave.' },
    innate: 'Balanced arcs; mobile combos.',
  },
  daggers: {
    id: 'daggers',
    label: 'Daggers',
    heavy: false,
    baseDamage: [6, 8],
    combo: [
      { windup: 0.04, active: 0.05, recovery: 0.11, mul: 1, reach: 18, arc: deg(100), lunge: 4, poise: 5, hitstop: 0.015, shake: 0.3, sweep: 1 },
      { windup: 0.04, active: 0.05, recovery: 0.11, mul: 1, reach: 18, arc: deg(100), lunge: 4, poise: 5, hitstop: 0.015, shake: 0.3, sweep: -1 },
      { windup: 0.04, active: 0.05, recovery: 0.11, mul: 1, reach: 18, arc: deg(100), lunge: 4, poise: 5, hitstop: 0.015, shake: 0.3, sweep: 1 },
      { windup: 0.06, active: 0.06, recovery: 0.2, mul: 1.6, reach: 20, arc: deg(140), lunge: 8, poise: 12, hitstop: 0.03, shake: 0.6, sweep: -1 },
    ],
    skill: { id: 'lunge', name: 'Crossing Lunge', cooldown: 3.5, desc: 'Dash through foes, cutting twice.' },
    innate: 'Fast cuts build status quickly.',
  },
  hammer: {
    id: 'hammer',
    label: 'Hammer',
    heavy: true,
    baseDamage: [25, 31],
    combo: [
      { windup: 0.36, active: 0.1, recovery: 0.42, mul: 1, reach: 30, arc: deg(170), lunge: 6, poise: 60, hitstop: 0.08, shake: 3, sweep: 1 },
      { windup: 0.42, active: 0.12, recovery: 0.55, mul: 1.35, reach: 32, arc: deg(200), lunge: 10, poise: 90, hitstop: 0.1, shake: 4, sweep: -1 },
    ],
    skill: { id: 'fracture', name: 'Ground Fracture', cooldown: 7, desc: 'Slam the ground: a wide radial shockwave.' },
    innate: 'Heavy hits shatter frozen foes.',
  },
};

/** Attacks per second over a full combo, for honest comparison numbers. */
export function attackRate(fam: FamilyDef, speedMul = 1): number {
  const t = fam.combo.reduce((s, c) => s + c.windup + c.active + c.recovery, 0) / speedMul;
  return fam.combo.length / t;
}

export function sustainedDps(item: Item, speedMul = 1): number {
  const fam = FAMILIES[item.family!];
  const t = fam.combo.reduce((s, c) => s + c.windup + c.active + c.recovery, 0) / (speedMul * itemSpeedMul(item));
  const total = fam.combo.reduce((s, c) => s + c.mul, 0) * (item.damage ?? 0);
  return total / t;
}

export function itemSpeedMul(item: Item): number {
  const s = item.affixes.find((a) => a.id === 'swift');
  return 1 + (s ? s.value / 100 : 0);
}

// ---------------------------------------------------------------------------
// Affixes: description + where they can roll.

interface AffixDef {
  id: AffixId;
  slots: Slot[];
  families?: WeaponFamily[];
  /** Only rolls on weapons of these elements (so a property is never dead weight). */
  elements?: Element[];
  roll: (rng: Rng, level: number) => number;
  text: (v: number) => string;
  /** Tags used for synergy explanations. */
  tags: string[];
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  critChance: { id: 'critChance', slots: ['weapon', 'ring'], roll: (r) => r.int(6, 12), text: (v) => `+${v}% critical chance`, tags: ['crit'] },
  swift: { id: 'swift', slots: ['weapon'], roll: (r) => r.int(8, 15), text: (v) => `+${v}% attack speed`, tags: [] },
  keen: { id: 'keen', slots: ['weapon'], roll: (r) => r.int(10, 20), text: (v) => `+${v}% reach`, tags: [] },
  shatterer: {
    id: 'shatterer',
    slots: ['weapon'],
    families: ['sword', 'daggers'],
    roll: () => 1,
    text: () => 'Finishing combo hits shatter frozen foes',
    tags: ['shatter'],
  },
  reaper: { id: 'reaper', slots: ['weapon'], roll: (r) => r.int(3, 6), text: (v) => `Heal ${v} on kill`, tags: ['kill'] },
  venomous: { id: 'venomous', slots: ['weapon'], elements: ['poison'], roll: (r) => r.int(20, 35), text: (v) => `+${v}% poison damage`, tags: ['poison'] },
  rimed: { id: 'rimed', slots: ['weapon'], roll: (r) => r.int(15, 25), text: (v) => `+${v}% damage to frozen foes`, tags: ['frost'] },

  vitality: { id: 'vitality', slots: ['chest', 'ring'], roll: (r, l) => r.int(10, 16) + l * 2, text: (v) => `+${v} maximum health`, tags: [] },
  thorns: { id: 'thorns', slots: ['chest'], roll: (r) => r.int(30, 50), text: (v) => `When hit, poison attacker (+${v} buildup)`, tags: ['poison'] },
  warding: { id: 'warding', slots: ['chest'], roll: (r) => r.int(1, 2), text: (v) => `Recover ${v} flask charge${v > 1 ? 's' : ''} at each stair`, tags: [] },

  fleet: { id: 'fleet', slots: ['boots'], roll: (r) => r.int(8, 14), text: (v) => `+${v}% movement speed`, tags: [] },
  quickstep: { id: 'quickstep', slots: ['boots'], roll: (r) => r.int(15, 30), text: (v) => `${v}% faster dodge recovery`, tags: ['dodge'] },
  frostStep: { id: 'frostStep', slots: ['boots', 'ring'], roll: (r) => r.int(35, 55), text: (v) => `Dodging chills nearby foes (+${v} frost)`, tags: ['dodge', 'frost'] },

  frostNova: { id: 'frostNova', slots: ['ring'], roll: (r) => r.int(55, 80), text: (v) => `Shatters spread frost to nearby foes (+${v})`, tags: ['shatter', 'frost'] },
  sporeBloom: { id: 'sporeBloom', slots: ['ring'], roll: (r) => r.int(50, 75), text: (v) => `Poisoned foes burst into spores on death (+${v} poison nearby)`, tags: ['poison', 'kill'] },
  shadowEcho: { id: 'shadowEcho', slots: ['ring'], roll: (r) => r.int(50, 70), text: (v) => `After a dodge, a shadow repeats your next attack (${v}% damage)`, tags: ['dodge'] },
  venomHeart: { id: 'venomHeart', slots: ['ring'], roll: (r) => r.int(25, 40), text: (v) => `+${v}% poison buildup`, tags: ['poison'] },
  rimeHeart: { id: 'rimeHeart', slots: ['ring'], roll: (r) => r.int(25, 40), text: (v) => `+${v}% frost buildup`, tags: ['frost'] },
  bloodPrice: { id: 'bloodPrice', slots: ['ring'], roll: (r) => r.int(15, 25), text: (v) => `+${v}% damage, but flasks heal 25% less`, tags: [] },
  luckyStrike: { id: 'luckyStrike', slots: ['ring'], roll: (r) => r.int(40, 60), text: (v) => `Critical hits deal +${v}% damage`, tags: ['crit'] },
};

export function affixText(a: Affix): string {
  return AFFIXES[a.id].text(a.value);
}

export function hasAffix(item: Item | null | undefined, id: AffixId): number {
  if (!item) return 0;
  let v = 0;
  for (const a of item.affixes) if (a.id === id) v += a.value;
  return v;
}

// ---------------------------------------------------------------------------
// Names: composed so each name hints at what the item does.

const ELEMENT_PREFIX: Record<Element, string[]> = {
  none: ['Wanderer', 'Old', 'Moss', 'Grey', 'Iron', 'Ruin', 'Oak'],
  poison: ['Briar', 'Thorn', 'Venom', 'Blight', 'Nettle', 'Rot'],
  frost: ['Winter', 'Rime', 'Frost', 'Glacier', 'Hoar', 'Snow'],
};
const FAMILY_SUFFIX: Record<WeaponFamily, string[]> = {
  sword: ['brand', 'edge', 'fang', 'song', 'blade'],
  daggers: ['hook', 'twins', 'sting', 'pair', 'kiss'],
  hammer: ['bell', 'maul', 'fall', 'crown', 'anvil'],
};
const RING_NAMES: Partial<Record<AffixId, string[]>> = {
  frostNova: ['Ring of the Long Winter', 'Shardbloom Ring', 'Hoarfrost Loop'],
  sporeBloom: ['Mycelial Band', 'Orchard Ring', 'Sporeheart Loop'],
  shadowEcho: ['Ring of the Borrowed Shadow', 'Echo Band', 'Twinned Loop'],
  venomHeart: ['Viper Coil', 'Nettle Ring'],
  rimeHeart: ['Coldstone Ring', 'Snowglass Band'],
  bloodPrice: ['Glass Pact Ring', 'Red Bargain'],
  luckyStrike: ['Gambler\'s Loop', 'Fortune Coil'],
  frostStep: ['Skater\'s Ring', 'Drift Band'],
  critChance: ['Keen Eye Ring', 'Hawk Band'],
  vitality: ['Heartwood Ring', 'Oak Band'],
};

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Generation.

let uidCounter = 0;
export function newUid(rng: Rng): string {
  uidCounter = (uidCounter + 1) % 1e6;
  return `${rng.nextU32().toString(36)}${uidCounter.toString(36)}`;
}

export function rollRarity(rng: Rng, level: number, bonus = 0): Rarity {
  const l = level + bonus;
  return rng.weighted<Rarity>([
    ['common', Math.max(10, 50 - l * 8)],
    ['uncommon', 30],
    ['rare', 10 + l * 4],
    ['epic', 2 + l * 2.5],
    ['mythic', l >= 3 ? 0.6 + l * 0.3 : 0],
  ]);
}

const AFFIX_COUNT: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 2, mythic: 3 };
const RARITY_POWER: Record<Rarity, number> = { common: 1, uncommon: 1.06, rare: 1.12, epic: 1.2, mythic: 1.28 };

export interface WeaponOpts {
  family?: WeaponFamily;
  element?: Element;
  rarity?: Rarity;
  name?: string;
  affixes?: Affix[];
}

export function makeWeapon(rng: Rng, level: number, opts: WeaponOpts = {}): Item {
  const family = opts.family ?? rng.pick<WeaponFamily>(['sword', 'daggers', 'hammer']);
  const rarity = opts.rarity ?? rollRarity(rng, level);
  const fam = FAMILIES[family];
  const element = opts.element ?? rng.weighted<Element>([
    ['none', rarity === 'common' ? 5 : 2],
    ['poison', 3],
    ['frost', 3],
  ]);
  const levelMul = 1 + (level - 1) * 0.12;
  const damage = Math.round(rng.range(fam.baseDamage[0], fam.baseDamage[1]) * levelMul * RARITY_POWER[rarity]);
  // Buildup budget: lighter weapons apply less per hit but hit far more often.
  const baseBuild = family === 'hammer' ? 30 : family === 'sword' ? 15 : 8;
  const buildup = element === 'none' ? 0 : Math.round(baseBuild * rng.range(0.9, 1.25) * RARITY_POWER[rarity]);
  const affixes = opts.affixes ?? rollAffixes(rng, 'weapon', level, AFFIX_COUNT[rarity], family, element);
  const name = opts.name ?? `${rng.pick(ELEMENT_PREFIX[element])}${rng.pick(FAMILY_SUFFIX[family])}`;
  return {
    uid: newUid(rng),
    slot: 'weapon',
    family,
    name: cap(name),
    rarity,
    level,
    damage,
    element,
    buildup,
    affixes,
    look: rng.nextU32(),
  };
}

function rollAffixes(rng: Rng, slot: Slot, level: number, count: number, family?: WeaponFamily, element?: Element): Affix[] {
  const pool = (Object.values(AFFIXES) as AffixDef[]).filter(
    (d) =>
      d.slots.includes(slot) &&
      (!d.families || !family || d.families.includes(family)) &&
      (!d.elements || (element !== undefined && d.elements.includes(element))),
  );
  rng.shuffle(pool);
  return pool.slice(0, count).map((d) => ({ id: d.id, value: d.roll(rng, level) }));
}

/** Ring with one signature trigger plus extra stat lines by rarity. */
export function makeRing(rng: Rng, level: number, signature?: AffixId, rarity?: Rarity): Item {
  const r = rarity ?? rollRarity(rng, level, 1);
  const sigPool: AffixId[] = ['frostNova', 'sporeBloom', 'shadowEcho', 'venomHeart', 'rimeHeart', 'bloodPrice', 'luckyStrike', 'frostStep'];
  const sig = signature ?? rng.pick(sigPool);
  const affixes: Affix[] = [{ id: sig, value: AFFIXES[sig].roll(rng, level) }];
  const extraCount = Math.max(0, AFFIX_COUNT[r] - 1);
  const extras = (['critChance', 'vitality'] as AffixId[]).filter((a) => a !== sig);
  rng.shuffle(extras);
  for (const id of extras.slice(0, extraCount)) affixes.push({ id, value: AFFIXES[id].roll(rng, level) });
  const names = RING_NAMES[sig] ?? ['Plain Band'];
  return { uid: newUid(rng), slot: 'ring', name: rng.pick(names), rarity: r, level, element: 'none', buildup: 0, affixes, look: rng.nextU32() };
}

export function makeArmor(rng: Rng, level: number, slot: 'chest' | 'boots', rarity?: Rarity): Item {
  const r = rarity ?? rollRarity(rng, level);
  const affixes = rollAffixes(rng, slot, level, Math.max(1, AFFIX_COUNT[r]));
  const chestNames = ['Mossweave Jerkin', 'Ruinwarden Coat', 'Bramble Vest', 'Lichen Mail', 'Pilgrim Tunic'];
  const bootNames = ['Dewstep Boots', 'Rootrunner Boots', 'Pathfinder Boots', 'Quiet Treads', 'Mire Walkers'];
  return {
    uid: newUid(rng),
    slot,
    name: rng.pick(slot === 'chest' ? chestNames : bootNames),
    rarity: r,
    level,
    element: 'none',
    buildup: 0,
    defense: slot === 'chest' ? Math.round(rng.range(2, 4) + level * 0.8) : undefined,
    affixes,
    look: rng.nextU32(),
  };
}

export function starterWeapon(rng: Rng, family: WeaponFamily = 'sword'): Item {
  const names: Record<WeaponFamily, string> = { sword: 'Wanderer\'s Blade', daggers: 'Pilgrim Knives', hammer: 'Mason\'s Maul' };
  const w = makeWeapon(rng, 1, { family, element: 'none', rarity: 'common', name: names[family], affixes: [] });
  w.damage = FAMILIES[family].baseDamage[0];
  return w;
}

export function randomLoot(rng: Rng, level: number, rarityBonus = 0): Item {
  const kind = rng.weighted<Slot>([
    ['weapon', 5],
    ['ring', 3],
    ['chest', 1.5],
    ['boots', 1.5],
  ]);
  if (kind === 'weapon') return makeWeapon(rng, level, { rarity: rollRarity(rng, level, rarityBonus) });
  if (kind === 'ring') return makeRing(rng, level, undefined, rollRarity(rng, level, rarityBonus + 1));
  return makeArmor(rng, level, kind, rollRarity(rng, level, rarityBonus));
}

export function itemTags(item: Item): Set<string> {
  const tags = new Set<string>();
  if (item.element !== 'none') tags.add(item.element);
  if (item.family === 'hammer') tags.add('shatter');
  for (const a of item.affixes) for (const t of AFFIXES[a.id].tags) tags.add(t);
  return tags;
}

export function salvageValue(item: Item): number {
  return 4 + RARITIES.indexOf(item.rarity) * 6 + item.level * 2;
}

export const SLOT_LABEL: Record<Slot, string> = { weapon: 'Weapon', chest: 'Chest', boots: 'Boots', ring: 'Ring' };
