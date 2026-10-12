import { Rng } from '../core/rng';
import { EL_ADJ, EL_STATUS, Element, STATUS_ELS, StatusEl } from './elements';

/**
 * Item properties are composed from small vocabularies — stats, conditions and
 * trigger × effect × element procs — so the same handful of rules produces
 * thousands of distinct, readable items.
 */

export type StatId =
  | 'dmg'
  | 'atkSpd'
  | 'reach'
  | 'crit'
  | 'critDmg'
  | 'build'
  | 'elBuild'
  | 'elDmg'
  | 'move'
  | 'dodgeCd'
  | 'maxHp'
  | 'defense'
  | 'lifeSteal'
  | 'lifeKill'
  | 'gold'
  | 'skillCd'
  | 'skillDmg'
  | 'aoe'
  | 'statusDur'
  | 'flask'
  | 'proj'
  | 'guard';

export type Trigger = 'hit' | 'crit' | 'kill' | 'dodge' | 'hurt' | 'finisher' | 'skill' | 'nth' | 'status' | 'shatter' | 'swap' | 'flask' | 'pulse';
export type EffectId =
  | 'nova'
  | 'bolts'
  | 'shards'
  | 'chain'
  | 'meteor'
  | 'vortex'
  | 'spores'
  | 'orbit'
  | 'wisp'
  | 'explode'
  | 'echo'
  | 'heal'
  | 'shield'
  | 'haste'
  | 'cdr';
export type CondId = 'vsPoison' | 'vsFrozen' | 'vsBurning' | 'vsShocked' | 'vsStatus' | 'fullHp' | 'lowHp' | 'afterDodge' | 'elite' | 'crowd' | 'firstStrike' | 'alone';
export type RuleId =
  | 'twinStrike'
  | 'waveSwings'
  | 'giant'
  | 'bloodPact'
  | 'statusSpread'
  | 'glassCannon'
  | 'mastery'
  | 'vampiric'
  | 'berserk'
  | 'decoy'
  | 'phoenix'
  | 'chainReaction'
  | 'stormborn'
  | 'everfrost';

export interface StatProp {
  k: 'stat';
  stat: StatId;
  value: number;
  el?: StatusEl;
}
export interface ProcProp {
  k: 'proc';
  trig: Trigger;
  chance: number;
  /** nth hit count, or pulse interval in seconds. */
  n: number;
  effect: EffectId;
  el: Element;
  /** Damage multiplier of the player's base hit, or heal/shield amount, or haste %, or cooldown seconds. */
  power: number;
  count: number;
  icd: number;
  statusEl?: StatusEl;
}
export interface CondProp {
  k: 'cond';
  cond: CondId;
  value: number;
}
export interface RuleProp {
  k: 'rule';
  rule: RuleId;
  value: number;
}
export type Prop = StatProp | ProcProp | CondProp | RuleProp;

export type PropSlot = 'weapon' | 'ring' | 'chest' | 'boots' | 'relic' | 'boon';

// ---------------------------------------------------------------------------
// Stats

interface StatDef {
  slots: PropSlot[];
  w: number;
  roll: (r: Rng, q: number, lvl: number) => number;
  text: (v: number, el?: StatusEl) => string;
  tags: string[];
  needsEl?: boolean;
  rangedOnly?: boolean;
}

const sg = (v: number) => (v >= 0 ? `+${v}` : `${v}`);
const pct = (lo: number, hi: number) => (r: Rng, q: number) => Math.round(lo + (hi - lo) * (q * 0.7 + r.next() * 0.3));

export const STATS: Record<StatId, StatDef> = {
  dmg: { slots: ['weapon', 'ring', 'boon'], w: 4, roll: pct(6, 22), text: (v) => `${sg(v)}% damage`, tags: [] },
  atkSpd: { slots: ['weapon', 'ring', 'boon'], w: 3, roll: pct(5, 18), text: (v) => `${sg(v)}% attack speed`, tags: [] },
  reach: { slots: ['weapon', 'boon'], w: 2, roll: pct(8, 25), text: (v) => `+${v}% reach and area`, tags: [] },
  crit: { slots: ['weapon', 'ring', 'boon'], w: 3, roll: pct(4, 14), text: (v) => `${sg(v)}% critical chance`, tags: ['crit'] },
  critDmg: { slots: ['weapon', 'ring', 'boon'], w: 2, roll: pct(20, 70), text: (v) => `+${v}% critical damage`, tags: ['crit'] },
  build: { slots: ['weapon'], w: 3, roll: pct(15, 50), text: (v) => `+${v}% status buildup`, tags: ['status'], needsEl: true },
  elBuild: { slots: ['ring', 'boots', 'chest', 'boon'], w: 3, roll: pct(20, 60), text: (v, el) => `+${v}% ${EL_STATUS[el!].toLowerCase()} buildup`, tags: ['status'] },
  elDmg: { slots: ['ring', 'boon'], w: 2, roll: pct(25, 80), text: (v, el) => `+${v}% ${EL_ADJ[el!]} damage (effects and ticks)`, tags: ['status'] },
  move: { slots: ['boots', 'ring', 'boon'], w: 3, roll: pct(5, 16), text: (v) => `${sg(v)}% movement speed`, tags: [] },
  dodgeCd: { slots: ['boots', 'boon'], w: 3, roll: pct(10, 35), text: (v) => `${v}% faster dodge recovery`, tags: ['dodge'] },
  maxHp: { slots: ['chest', 'boots', 'ring', 'boon'], w: 4, roll: (r, q, l) => Math.round(8 + 18 * q + l * 3 + r.int(0, 4)), text: (v) => `${sg(v)} maximum health`, tags: [] },
  defense: { slots: ['chest', 'boots', 'boon'], w: 3, roll: (r, q, l) => Math.round(1 + 4 * q + l * 0.6 + r.int(0, 1)), text: (v) => `+${v} defence`, tags: [] },
  lifeSteal: { slots: ['weapon', 'ring', 'boon'], w: 1.5, roll: (r, q) => Math.round(1 + 3 * q + r.next()), text: (v) => `${v}% of damage dealt heals you`, tags: [] },
  lifeKill: { slots: ['weapon', 'ring', 'chest', 'boon'], w: 2, roll: (_r, q, l) => Math.round(2 + 4 * q + l * 0.5), text: (v) => `Heal ${v} on kill`, tags: ['kill'] },
  gold: { slots: ['ring', 'boots', 'boon'], w: 1, roll: pct(15, 50), text: (v) => `${sg(v)}% gold found`, tags: [] },
  skillCd: { slots: ['weapon', 'ring', 'boon'], w: 2, roll: pct(10, 30), text: (v) => `${v}% faster skill cooldown`, tags: ['skill'] },
  skillDmg: { slots: ['weapon', 'ring', 'boon'], w: 2, roll: pct(20, 70), text: (v) => `+${v}% skill damage`, tags: ['skill'] },
  aoe: { slots: ['ring', 'boon', 'chest'], w: 1.5, roll: pct(10, 35), text: (v) => `+${v}% effect area`, tags: [] },
  statusDur: { slots: ['ring', 'chest', 'boon'], w: 1.5, roll: pct(15, 45), text: (v) => `Statuses you inflict last ${v}% longer`, tags: ['status'] },
  flask: { slots: ['chest', 'boon'], w: 1.5, roll: pct(15, 45), text: (v) => (v >= 0 ? `Flasks heal ${v}% more` : `Flasks heal ${-v}% less`), tags: [] },
  proj: { slots: ['weapon', 'ring', 'boon'], w: 1, roll: (r, q) => (q > 0.6 && r.chance(0.4) ? 2 : 1), text: (v) => `+${v} projectile${v > 1 ? 's' : ''} on shots and bolts`, tags: [], rangedOnly: true },
  guard: { slots: ['chest', 'boots', 'boon'], w: 2, roll: pct(6, 18), text: (v) => (v >= 0 ? `Take ${v}% less damage` : `Take ${-v}% more damage`), tags: [] },
};

// ---------------------------------------------------------------------------
// Procs

const TRIG_SLOTS: Record<Trigger, PropSlot[]> = {
  hit: ['weapon', 'ring', 'boon'],
  crit: ['weapon', 'ring', 'boon'],
  kill: ['weapon', 'ring', 'chest', 'boon'],
  dodge: ['ring', 'boots', 'boon'],
  hurt: ['chest', 'ring', 'boon'],
  finisher: ['weapon', 'ring', 'boon'],
  skill: ['weapon', 'ring', 'boon'],
  nth: ['weapon', 'ring', 'boon'],
  status: ['weapon', 'ring', 'boon'],
  shatter: ['weapon', 'ring', 'boon'],
  swap: ['boots', 'ring', 'boon'],
  flask: ['chest', 'boon'],
  pulse: ['chest', 'ring', 'boon'],
};

const OFFENSIVE: EffectId[] = ['nova', 'bolts', 'shards', 'chain', 'meteor', 'vortex', 'spores', 'orbit', 'wisp'];
const SELF: EffectId[] = ['heal', 'shield', 'haste', 'cdr'];

function effectsFor(t: Trigger): EffectId[] {
  if (t === 'kill') return [...OFFENSIVE, 'explode', 'heal', 'shield', 'haste', 'cdr'];
  if (t === 'pulse') return OFFENSIVE;
  if (t === 'dodge') return [...OFFENSIVE, 'echo', ...SELF];
  if (t === 'finisher') return [...OFFENSIVE, 'echo', 'heal', 'shield', 'cdr'];
  if (t === 'hit') return [...OFFENSIVE.filter((e) => e !== 'wisp' && e !== 'meteor'), 'echo', 'heal'];
  if (t === 'hurt') return [...OFFENSIVE.filter((e) => e !== 'orbit'), ...SELF];
  return [...OFFENSIVE, ...SELF];
}

const EFFECT_W: Record<EffectId, number> = {
  nova: 3,
  bolts: 3,
  shards: 2.5,
  chain: 2.5,
  meteor: 1.5,
  vortex: 1,
  spores: 1.5,
  orbit: 1.5,
  wisp: 1,
  explode: 3,
  echo: 1,
  heal: 1.5,
  shield: 1.5,
  haste: 1.2,
  cdr: 1,
};

function rollProc(r: Rng, slot: PropSlot, q: number, lvl: number, prefEl: Element): ProcProp {
  const trigs = (Object.keys(TRIG_SLOTS) as Trigger[]).filter((t) => TRIG_SLOTS[t].includes(slot));
  const trig = r.pick(trigs);
  const effect = r.weighted(effectsFor(trig).map((e) => [e, EFFECT_W[e]] as const));
  const self = SELF.includes(effect) || effect === 'echo';
  let el: Element = 'none';
  if (!self) {
    if (effect === 'chain') el = r.chance(0.6) ? 'shock' : r.pick(STATUS_ELS);
    else if (prefEl !== 'none' && r.chance(0.6)) el = prefEl;
    else el = r.weighted<Element>([
      ['none', 1],
      ['poison', 2],
      ['frost', 2],
      ['burn', 2],
      ['shock', 2],
    ]);
  }
  let chance = 1;
  let n = 0;
  let icd = 0;
  switch (trig) {
    case 'hit':
      chance = (8 + 14 * q + r.int(0, 4)) / 100;
      icd = 0.3;
      break;
    case 'crit':
      chance = (30 + 40 * q) / 100;
      icd = 0.25;
      break;
    case 'kill':
      chance = effect === 'explode' ? 1 : (45 + 55 * q) / 100;
      break;
    case 'dodge':
      icd = 1;
      break;
    case 'hurt':
      icd = 1.5;
      break;
    case 'finisher':
      chance = (55 + 45 * q) / 100;
      break;
    case 'nth':
      n = Math.max(3, r.int(4, 8) - Math.round(q * 2));
      break;
    case 'status':
      icd = 0.4;
      break;
    case 'swap':
      icd = 3;
      break;
    case 'pulse':
      n = Math.max(2, Math.round(6 - q * 3 + r.next()));
      break;
  }
  if (effect === 'meteor' || effect === 'wisp' || effect === 'vortex') icd = Math.max(icd, 2.5);
  if (effect === 'orbit') icd = Math.max(icd, 3);
  chance = chance >= 0.94 ? 1 : Math.round(chance * 100) / 100;
  const k = 0.75 + q * 0.5 + lvl * 0.03;
  let power = 1;
  let count = 1;
  switch (effect) {
    case 'nova':
      power = 0.9 * k;
      break;
    case 'bolts':
      count = r.int(2, 3) + Math.round(q * 2);
      power = 0.4 * k;
      break;
    case 'shards':
      count = r.int(5, 7) + Math.round(q * 2);
      power = 0.3 * k;
      break;
    case 'chain':
      count = r.int(3, 4) + Math.round(q * 2);
      power = 0.55 * k;
      break;
    case 'meteor':
      power = 2.4 * k;
      break;
    case 'vortex':
      power = 0.7 * k;
      break;
    case 'spores':
      power = 0.25 * k;
      break;
    case 'orbit':
      count = r.int(2, 3) + Math.round(q);
      power = 0.35 * k;
      break;
    case 'wisp':
      power = 0.4 * k;
      break;
    case 'explode':
      power = 1.3 * k;
      break;
    case 'echo':
      power = 0.5 + q * 0.3;
      break;
    case 'heal':
      power = Math.round(3 + 6 * q + lvl);
      break;
    case 'shield':
      power = Math.round(10 + 20 * q + lvl * 3);
      break;
    case 'haste':
      power = Math.round(20 + 25 * q);
      break;
    case 'cdr':
      power = Math.round((0.6 + 1.6 * q) * 10) / 10;
      break;
  }
  const statusEl = trig === 'status' ? r.pick(STATUS_ELS) : undefined;
  return { k: 'proc', trig, chance, n, effect, el, power: Math.round(power * 100) / 100, count, icd, statusEl };
}

// ---------------------------------------------------------------------------
// Conditions and mythic rules

const CONDS: { id: CondId; w: number; roll: (r: Rng, q: number) => number }[] = [
  { id: 'vsPoison', w: 2, roll: pct(20, 55) },
  { id: 'vsFrozen', w: 2, roll: pct(25, 70) },
  { id: 'vsBurning', w: 2, roll: pct(20, 55) },
  { id: 'vsShocked', w: 2, roll: pct(20, 55) },
  { id: 'vsStatus', w: 1.5, roll: pct(12, 35) },
  { id: 'fullHp', w: 1, roll: pct(15, 40) },
  { id: 'lowHp', w: 1, roll: pct(25, 70) },
  { id: 'afterDodge', w: 1.5, roll: pct(30, 80) },
  { id: 'elite', w: 1.5, roll: pct(20, 50) },
  { id: 'crowd', w: 1.2, roll: pct(5, 10) },
  { id: 'firstStrike', w: 1.2, roll: pct(40, 120) },
  { id: 'alone', w: 1, roll: pct(20, 45) },
];

export const RULES: Record<RuleId, { name: string; text: (v: number) => string; roll: (r: Rng) => number }> = {
  twinStrike: { name: 'Twinned', text: () => 'Every attack strikes twice (the second at half power)', roll: () => 0.5 },
  waveSwings: { name: 'Wavecaller', text: () => 'Melee swings also launch a travelling wave', roll: () => 0.6 },
  giant: { name: 'Titan', text: (v) => `+${v}% reach, area and damage, but 15% slower attacks`, roll: (r) => r.int(35, 50) },
  bloodPact: { name: 'Bloodbound', text: (v) => `Attacks cost 1 health but deal +${v}% damage`, roll: (r) => r.int(45, 70) },
  statusSpread: { name: 'Contagion', text: () => 'When an afflicted foe dies, its statuses leap to every foe nearby', roll: () => 1 },
  glassCannon: { name: 'Glass', text: (v) => `+${v}% damage, but you take 50% more damage`, roll: (r) => r.int(70, 100) },
  mastery: { name: 'Prismatic', text: (v) => `+${v}% buildup for every element, and statuses last longer`, roll: (r) => r.int(50, 80) },
  vampiric: { name: 'Sanguine', text: (v) => `${v}% of all damage dealt heals you`, roll: (r) => r.int(5, 8) },
  berserk: { name: 'Wrathful', text: () => 'Deal +1% damage for every 1% of missing health', roll: () => 1 },
  decoy: { name: 'Mirage', text: () => 'Dodging leaves a decoy that draws attacks, then explodes', roll: () => 1.5 },
  phoenix: { name: 'Phoenix', text: () => 'Once per floor, rise again at 50% health instead of dying', roll: () => 0.5 },
  chainReaction: { name: 'Cascading', text: () => 'Effects you trigger can trigger your other effects twice as deep', roll: () => 1 },
  stormborn: { name: 'Stormborn', text: (v) => `Critical hits call lightning on the target (${Math.round(v * 100)}% damage)`, roll: (r) => 0.6 + r.next() * 0.4 },
  everfrost: { name: 'Everfrost', text: () => 'Frozen foes stay frozen twice as long, and shattering refunds your dodge', roll: () => 1 },
};

// ---------------------------------------------------------------------------
// Rolling

export interface RollCtx {
  slot: PropSlot;
  quality: number;
  level: number;
  count: number;
  /** Element of the weapon, to make elemental stats meaningful. */
  element?: Element;
  ranged?: boolean;
  procs?: number;
  conds?: number;
  rule?: boolean;
  /** Signatures to avoid (anti-repetition). */
  avoid?: (sig: string) => number;
}

export function propSig(p: Prop): string {
  switch (p.k) {
    case 'stat':
      return `s:${p.stat}:${p.el ?? ''}`;
    case 'proc':
      return `p:${p.trig}:${p.effect}:${p.el}:${p.statusEl ?? ''}`;
    case 'cond':
      return `c:${p.cond}`;
    case 'rule':
      return `r:${p.rule}`;
  }
}

export function rollProps(r: Rng, rawCtx: RollCtx): Prop[] {
  // Relics share the ring vocabulary for their passive lines.
  const ctx: RollCtx = rawCtx.slot === 'relic' ? { ...rawCtx, slot: 'ring' } : rawCtx;
  const out: Prop[] = [];
  const has = new Set<string>();
  const add = (gen: () => Prop) => {
    // Try a few candidates and keep the least familiar one.
    let best: Prop | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < 5; i++) {
      const p = gen();
      const sig = propSig(p);
      const statKey = p.k === 'stat' ? `s:${p.stat}` : sig;
      if (has.has(statKey)) continue;
      const score = (ctx.avoid?.(sig) ?? 0) + r.next() * 0.5;
      if (score < bestScore) {
        best = p;
        bestScore = score;
      }
    }
    if (best) {
      has.add(best.k === 'stat' ? `s:${best.stat}` : propSig(best));
      out.push(best);
    }
  };
  const q = ctx.quality;
  const procs = ctx.procs ?? 0;
  const conds = ctx.conds ?? 0;
  for (let i = 0; i < procs; i++) add(() => rollProc(r, ctx.slot, q, ctx.level, ctx.element ?? 'none'));
  for (let i = 0; i < conds; i++)
    add(() => {
      const c = r.weighted(CONDS.map((c) => [c, c.w] as const));
      return { k: 'cond', cond: c.id, value: c.roll(r, q) };
    });
  const stats = Math.max(0, ctx.count - procs - conds - (ctx.rule ? 1 : 0));
  const pool = (Object.keys(STATS) as StatId[]).filter((s) => {
    const d = STATS[s];
    if (!d.slots.includes(ctx.slot)) return false;
    if (d.needsEl && (!ctx.element || ctx.element === 'none')) return false;
    if (d.rangedOnly && ctx.slot === 'weapon' && !ctx.ranged) return false;
    return true;
  });
  for (let i = 0; i < stats && pool.length; i++)
    add(() => {
      const s = r.weighted(pool.map((p) => [p, STATS[p].w] as const));
      const el = s === 'elBuild' || s === 'elDmg' ? (ctx.element && ctx.element !== 'none' && r.chance(0.6) ? (ctx.element as StatusEl) : r.pick(STATUS_ELS)) : undefined;
      return { k: 'stat', stat: s, value: STATS[s].roll(r, q, ctx.level), el };
    });
  if (ctx.rule) {
    const ids = Object.keys(RULES) as RuleId[];
    add(() => {
      const id = r.pick(ids);
      return { k: 'rule', rule: id, value: RULES[id].roll(r) };
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Text

const ORD = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

function trigText(p: ProcProp): string {
  const ch = p.chance < 1 ? `${Math.round(p.chance * 100)}% chance ` : '';
  switch (p.trig) {
    case 'hit':
      return `On hit, ${ch}to`;
    case 'crit':
      return ch ? `On critical hit, ${ch}to` : 'On critical hit,';
    case 'kill':
      return ch ? `On kill, ${ch}to` : 'On kill,';
    case 'dodge':
      return 'When you dodge,';
    case 'hurt':
      return 'When struck,';
    case 'finisher':
      return ch ? `Combo finishers have a ${ch}to` : 'Combo finishers';
    case 'skill':
      return 'When you use your skill,';
    case 'nth':
      return `Every ${ORD(p.n)} hit,`;
    case 'status':
      return `When you inflict ${EL_STATUS[p.statusEl!]},`;
    case 'shatter':
      return 'When you shatter a foe,';
    case 'swap':
      return 'When you swap weapons,';
    case 'flask':
      return 'When you drink a flask,';
    case 'pulse':
      return `Every ${p.n}s in combat,`;
  }
}

function effText(p: ProcProp): string {
  const el = EL_ADJ[p.el];
  const dmg = (m: number) => `${Math.round(m * 100)}%`;
  switch (p.effect) {
    case 'nova':
      return `release a ${el} nova (${dmg(p.power)})`;
    case 'bolts':
      return `launch ${p.count} homing ${el} bolts (${dmg(p.power)} each)`;
    case 'shards':
      return `burst into ${p.count} ${el} shards (${dmg(p.power)} each)`;
    case 'chain':
      return `arc ${el} lightning through ${p.count} foes (${dmg(p.power)})`;
    case 'meteor':
      return `call down a ${el} meteor (${dmg(p.power)})`;
    case 'vortex':
      return `open a ${el} vortex that drags foes in`;
    case 'spores':
      return `leave a lingering ${el} cloud`;
    case 'orbit':
      return `summon ${p.count} orbiting ${el} blades for 4s`;
    case 'wisp':
      return `summon a ${el} wisp that fights for 6s`;
    case 'explode':
      return `make the corpse explode in ${el} (${dmg(p.power)})`;
    case 'echo':
      return `have a shadow repeat the attack (${dmg(p.power)})`;
    case 'heal':
      return `heal ${p.power} health`;
    case 'shield':
      return `gain a ${p.power}-point barrier`;
    case 'haste':
      return `gain haste: +${p.power}% speed for 3s`;
    case 'cdr':
      return `cut your skill cooldown by ${p.power}s`;
  }
}

const COND_TEXT: Record<CondId, (v: number) => string> = {
  vsPoison: (v) => `+${v}% damage to poisoned foes`,
  vsFrozen: (v) => `+${v}% damage to frozen foes`,
  vsBurning: (v) => `+${v}% damage to burning foes`,
  vsShocked: (v) => `+${v}% damage to shocked foes`,
  vsStatus: (v) => `+${v}% damage to foes suffering any status`,
  fullHp: (v) => `+${v}% damage while at full health`,
  lowHp: (v) => `+${v}% damage while below 40% health`,
  afterDodge: (v) => `+${v}% damage for 1.5s after a dodge`,
  elite: (v) => `+${v}% damage to elites and bosses`,
  crowd: (v) => `+${v}% damage for each foe near you (up to 5)`,
  firstStrike: (v) => `+${v}% damage to unharmed foes`,
  alone: (v) => `+${v}% damage when only one foe is near`,
};

export function propText(p: Prop): string {
  switch (p.k) {
    case 'stat':
      return STATS[p.stat].text(p.value, p.el);
    case 'proc': {
      return `${trigText(p)} ${effText(p)}`;
    }
    case 'cond':
      return COND_TEXT[p.cond](p.value);
    case 'rule':
      return RULES[p.rule].text(p.value);
  }
}

export function propTags(p: Prop): string[] {
  const tags: string[] = [];
  if (p.k === 'stat') {
    tags.push(...STATS[p.stat].tags);
    if (p.el) tags.push(p.el);
  } else if (p.k === 'proc') {
    tags.push(`t:${p.trig}`, `e:${p.effect}`);
    if (p.el !== 'none') tags.push(p.el);
    if (p.statusEl) tags.push(`needs:${p.statusEl}`);
    if (p.trig === 'shatter') tags.push('needs:shatter');
    if (p.trig === 'crit') tags.push('needs:crit');
    if (p.trig === 'dodge') tags.push('dodge');
  } else if (p.k === 'cond') {
    const m: Partial<Record<CondId, string>> = { vsPoison: 'needs:poison', vsFrozen: 'needs:frost', vsBurning: 'needs:burn', vsShocked: 'needs:shock' };
    if (m[p.cond]) tags.push(m[p.cond]!);
  } else tags.push(`rule:${p.rule}`);
  return tags;
}
