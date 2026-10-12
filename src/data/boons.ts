import { Rng } from '../core/rng';
import { EL_ADJ } from './elements';
import { newUid, Rarity, rollRarity } from './items';
import { EffectId, Prop, rollProps, StatId, Trigger } from './props';

/** Run-only passive. Boons come from the same property vocabulary as items. */
export interface Boon {
  uid: string;
  name: string;
  rarity: Rarity;
  props: Prop[];
  cursed?: boolean;
  /** Bargains may also hand over an item reward (resolved by the game). */
  gift?: 'weapon' | 'ring' | 'relic' | 'gold';
}

const EFFECT_NOUN: Record<EffectId, string[]> = {
  nova: ['Bloom', 'Flare', 'Halo'],
  bolts: ['Volley', 'Swarm', 'Darts'],
  shards: ['Splinters', 'Shardrain', 'Glassburst'],
  chain: ['Arc', 'Conduit', 'Forked Path'],
  meteor: ['Starfall', 'Comet', 'Skyfire'],
  vortex: ['Maelstrom', 'Undertow', 'Whirl'],
  spores: ['Miasma', 'Spore Veil', 'Fog'],
  orbit: ['Carousel', 'Orbit', 'Wheel'],
  wisp: ['Familiar', 'Wisp', 'Lantern Spirit'],
  explode: ['Pyre', 'Rupture', 'Bursting'],
  echo: ['Echo', 'Shadow', 'Twin'],
  heal: ['Mending', 'Renewal', 'Sap'],
  shield: ['Bulwark', 'Bark Skin', 'Aegis'],
  haste: ['Quickening', 'Tailwind', 'Rush'],
  cdr: ['Focus', 'Clarity', 'Momentum'],
};
const TRIG_NOUN: Record<Trigger, string[]> = {
  hit: ['the Blade', 'Every Cut'],
  crit: ['Precision', 'the Keen Eye'],
  kill: ['the Harvest', 'the Reaper'],
  dodge: ['the Dancer', 'Footwork'],
  hurt: ['Spite', 'the Wounded'],
  finisher: ['the Finale', 'the Last Word'],
  skill: ['Technique', 'the Adept'],
  nth: ['Rhythm', 'the Metronome'],
  status: ['Affliction', 'the Plague-Doctor'],
  shatter: ['Splinters', 'the Glazier'],
  swap: ['the Juggler', 'Both Hands'],
  flask: ['the Draught', 'Bitter Tonic'],
  pulse: ['the Heartbeat', 'Tides'],
};
const STAT_NAMES: Partial<Record<StatId, string[]>> = {
  dmg: ['Whetstone', 'Sharpened Will', 'Heavy Hand'],
  atkSpd: ['Quick Wrists', 'Flurry', 'Hummingbird'],
  crit: ['Keen Eye', 'Hawk Sight'],
  critDmg: ['Executioner', 'Cruel Edge'],
  move: ['Light Feet', 'Fox Step'],
  dodgeCd: ['Acrobat', 'Second Wind'],
  maxHp: ['Heartwood', 'Deep Roots'],
  defense: ['Iron Skin', 'Bark Hide'],
  lifeSteal: ['Leech', 'Thirst'],
  lifeKill: ['Scavenger', 'Carrion Feast'],
  gold: ['Magpie', 'Lucky Coin'],
  skillCd: ['Patience', 'Clockwork'],
  skillDmg: ['Technique', 'Mastery'],
  aoe: ['Wide Reach', 'Ripples'],
  statusDur: ['Lingering Curse', 'Slow Poison'],
  elBuild: ['Attunement', 'Kindling'],
  elDmg: ['Elemental Fury', 'Overflow'],
  guard: ['Steadfast', 'Turtle Shell'],
  flask: ['Herbalist', 'Strong Brew'],
  reach: ['Long Arms', 'Wide Swing'],
  proj: ['Fletcher', 'Split Shot'],
};

function nameFor(r: Rng, p: Prop): string {
  if (p.k === 'proc') {
    const el = p.el !== 'none' ? `${EL_ADJ[p.el][0].toUpperCase()}${EL_ADJ[p.el].slice(1)} ` : '';
    return `${el}${r.pick(EFFECT_NOUN[p.effect])} of ${r.pick(TRIG_NOUN[p.trig])}`;
  }
  if (p.k === 'stat') return r.pick(STAT_NAMES[p.stat] ?? ['Blessing']);
  if (p.k === 'cond') return r.pick(['Opportunist', 'Predator', 'Duellist', 'Hunter', 'Tactician']);
  return 'Mythic Oath';
}

export function makeBoon(r: Rng, level: number, avoid: (sig: string) => number, rarity?: Rarity): Boon {
  const rar = rarity ?? rollRarity(r, level, 1);
  const q = { common: 0.3, uncommon: 0.45, rare: 0.6, epic: 0.8, mythic: 1 }[rar];
  const procs = rar === 'common' ? 0 : r.chance(rar === 'uncommon' ? 0.45 : 0.75) ? 1 : 0;
  const conds = procs === 0 && r.chance(0.3) ? 1 : 0;
  const count = rar === 'epic' || rar === 'mythic' ? 2 : 1;
  const props = rollProps(r, { slot: 'boon', quality: q, level, count: Math.max(count, procs + conds), procs, conds, rule: rar === 'mythic', avoid });
  return { uid: newUid(r), name: nameFor(r, props[0]), rarity: rar, props };
}

/** Cursed shrine bargain: a strong gift with a clearly stated price. */
export function makeBargain(r: Rng, level: number, avoid: (sig: string) => number): Boon {
  const costs: Prop[] = [
    { k: 'stat', stat: 'maxHp', value: -(18 + level * 4) },
    { k: 'stat', stat: 'guard', value: -25 },
    { k: 'stat', stat: 'flask', value: -40 },
    { k: 'stat', stat: 'move', value: -12 },
    { k: 'stat', stat: 'gold', value: -50 },
    { k: 'stat', stat: 'atkSpd', value: -12 },
  ];
  const cost = r.pick(costs);
  const kind = r.weighted<NonNullable<Boon['gift']> | 'power'>([
    ['power', 3],
    ['weapon', 1.2],
    ['ring', 1],
    ['relic', 1],
  ]);
  if (kind === 'power') {
    const gain = rollProps(r, { slot: 'boon', quality: 1, level: level + 1, count: 2, procs: 1, conds: 0, rule: r.chance(0.35), avoid });
    const names = ['Glass Pact', 'Hungry Oath', 'Bitter Bargain', 'Thorned Covenant', 'Ashen Accord', 'Pale Promise', 'Red Ledger', 'Hollow Vow', 'Moth-Eaten Contract', 'Drowned Oath'];
    return { uid: newUid(r), name: r.pick(names), rarity: 'epic', props: [...gain, cost], cursed: true };
  }
  const gname = { weapon: 'Hungry Steel', ring: 'Debt of Rings', relic: 'Borrowed Miracle', gold: 'Gilded Debt' }[kind];
  return { uid: newUid(r), name: gname, rarity: 'epic', props: [cost], cursed: true, gift: kind };
}
