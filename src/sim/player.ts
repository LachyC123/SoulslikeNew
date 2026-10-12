import { Boon } from '../data/boons';
import { StatusEl, STATUS_ELS } from '../data/elements';
import { FAMILIES, Item, sustainedDps } from '../data/items';
import { CondProp, ProcProp, Prop, RuleId, StatId } from '../data/props';
import { Loadout, loadoutItems } from '../data/synergy';
import { AttackStep, comboFor, FamilyDef, variantOf, WeaponFamily } from '../data/weapons';

export const BAG_SIZE = 12;
export const BASE_HP = 100;
export const BOON_SLOTS = 6;

export interface StatusState {
  build: number;
  idle: number;
  active: number;
  tick: number;
  /** Threshold multiplier: grows after each activation (repeated control resistance). */
  resist: number;
}

export const newStatus = (): StatusState => ({ build: 0, idle: 0, active: 0, tick: 0, resist: 1 });

export interface ActiveProc {
  p: ProcProp;
  key: string;
  source: string;
}

export interface Build {
  maxHp: number;
  defense: number;
  guard: number;
  moveMul: number;
  dodgeCdMul: number;
  crit: number;
  critBonus: number;
  dmgMul: number;
  atkSpeed: number;
  reachMul: number;
  lifeSteal: number;
  lifeKill: number;
  goldMul: number;
  skillCdMul: number;
  skillDmg: number;
  aoe: number;
  statusDur: number;
  flaskMul: number;
  proj: number;
  build: number;
  elBuild: Record<StatusEl, number>;
  elDmg: Record<StatusEl, number>;
  procs: ActiveProc[];
  conds: CondProp[];
  rules: Map<RuleId, number>;
}

export interface WeaponStats {
  item: Item;
  family: WeaponFamily;
  fam: FamilyDef;
  combo: AttackStep[];
  damage: number;
  speedMul: number;
  reachMul: number;
  crit: number;
  /** Damage of an average half-second, used to scale triggered effects across weapons. */
  procBase: number;
}

export type PlayerState = 'free' | 'attack' | 'dodge' | 'skill' | 'flask' | 'dead';

export interface Player {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  face: number;
  dir4: number;
  moving: boolean;
  walkT: number;
  hp: number;
  flasks: number;
  maxFlasks: number;
  gold: number;
  state: PlayerState;
  stateT: number;
  atkStep: number;
  atkPhase: 'windup' | 'active' | 'recovery';
  atkT: number;
  atkDir: number;
  atkId: number;
  atkQueued: boolean;
  atkFired: boolean;
  atkCount: number;
  comboIdle: number;
  targetId: number | null;
  echoPending: number;
  echoArmed: number;
  dodgeDx: number;
  dodgeDy: number;
  dodgeCd: number;
  invuln: number;
  hurtT: number;
  skillId: string;
  skillCd: [number, number];
  skillDir: number;
  skillHit: number;
  skillX: number;
  skillY: number;
  weaponIndex: 0 | 1;
  swapLock: number;
  loadout: Loadout;
  bag: (Item | null)[];
  boons: Boon[];
  build: Build;
  bonusHp: number;
  poison: StatusState;
  burn: StatusState;
  chill: StatusState;
  causeOfDeath: string;
  flash: number;
  // buffs
  shield: number;
  shieldT: number;
  hasteT: number;
  hastePct: number;
  warcryT: number;
  warcryPct: number;
  mirrorT: number;
  mirrorPct: number;
  afterDodgeT: number;
  relicCd: number;
  hitCount: number;
  phoenixUsed: boolean;
  icd: Map<string, number>;
}

export function createPlayer(x: number, y: number, starter: Item, bonusHp = 0, bonusFlasks = 0): Player {
  const p: Player = {
    x,
    y,
    r: 5,
    vx: 0,
    vy: 0,
    face: Math.PI / 2,
    dir4: 0,
    moving: false,
    walkT: 0,
    hp: BASE_HP + bonusHp,
    flasks: 3 + bonusFlasks,
    maxFlasks: 3 + bonusFlasks,
    gold: 0,
    state: 'free',
    stateT: 0,
    atkStep: 0,
    atkPhase: 'windup',
    atkT: 0,
    atkDir: 0,
    atkId: 0,
    atkQueued: false,
    atkFired: false,
    atkCount: 0,
    comboIdle: 0,
    targetId: null,
    echoPending: 0,
    echoArmed: 0,
    dodgeDx: 0,
    dodgeDy: 1,
    dodgeCd: 0,
    invuln: 0,
    hurtT: 0,
    skillId: '',
    skillCd: [0, 0],
    skillDir: 0,
    skillHit: 0,
    skillX: 0,
    skillY: 0,
    weaponIndex: 0,
    swapLock: 0,
    loadout: { weapons: [starter, null], chest: null, boots: null, rings: [null, null], relic: null },
    bag: new Array(BAG_SIZE).fill(null),
    boons: [],
    build: null as unknown as Build,
    bonusHp,
    poison: newStatus(),
    burn: newStatus(),
    chill: newStatus(),
    causeOfDeath: '',
    flash: 0,
    shield: 0,
    shieldT: 0,
    hasteT: 0,
    hastePct: 0,
    warcryT: 0,
    warcryPct: 0,
    mirrorT: 0,
    mirrorPct: 0,
    afterDodgeT: 0,
    relicCd: 0,
    hitCount: 0,
    phoenixUsed: false,
    icd: new Map(),
  };
  p.build = computeBuild(p);
  p.hp = p.build.maxHp;
  return p;
}

/** All property sources that are active now: active weapon, armour, rings, relic and boons. */
export function activeProps(p: Player): { props: Prop[]; source: string; uid: string }[] {
  const out: { props: Prop[]; source: string; uid: string }[] = [];
  const active = p.loadout.weapons[p.weaponIndex];
  for (const it of loadoutItems(p.loadout)) {
    if (it.slot === 'weapon' && it !== active) continue;
    out.push({ props: it.props, source: it.name, uid: it.uid });
  }
  for (const b of p.boons) out.push({ props: b.props, source: b.name, uid: b.uid });
  return out;
}

export function computeBuild(p: Player): Build {
  const sum: Partial<Record<StatId, number>> = {};
  const elBuild = Object.fromEntries(STATUS_ELS.map((e) => [e, 0])) as Record<StatusEl, number>;
  const elDmg = Object.fromEntries(STATUS_ELS.map((e) => [e, 0])) as Record<StatusEl, number>;
  const procs: ActiveProc[] = [];
  const conds: CondProp[] = [];
  const rules = new Map<RuleId, number>();
  for (const src of activeProps(p)) {
    src.props.forEach((pr, i) => {
      if (pr.k === 'stat') {
        if (pr.stat === 'elBuild' && pr.el) elBuild[pr.el] += pr.value;
        else if (pr.stat === 'elDmg' && pr.el) elDmg[pr.el] += pr.value;
        else sum[pr.stat] = (sum[pr.stat] ?? 0) + pr.value;
      } else if (pr.k === 'proc') procs.push({ p: pr, key: `${src.uid}:${i}`, source: src.source });
      else if (pr.k === 'cond') conds.push(pr);
      else rules.set(pr.rule, Math.max(rules.get(pr.rule) ?? 0, pr.value));
    });
  }
  const s = (id: StatId) => sum[id] ?? 0;
  const mastery = rules.get('mastery') ?? 0;
  if (mastery) for (const e of STATUS_ELS) elBuild[e] += mastery;
  const giant = rules.get('giant') ?? 0;
  const glass = rules.get('glassCannon') ?? 0;
  const blood = rules.get('bloodPact') ?? 0;
  return {
    maxHp: Math.max(20, BASE_HP + p.bonusHp + s('maxHp')),
    defense: (p.loadout.chest?.defense ?? 0) + (p.loadout.boots?.defense ?? 0) + s('defense'),
    guard: Math.min(60, s('guard')) - (glass ? 50 : 0),
    moveMul: Math.max(0.5, 1 + s('move') / 100),
    dodgeCdMul: Math.max(0.3, 1 - s('dodgeCd') / 100),
    crit: 0.05 + s('crit') / 100,
    critBonus: 0.5 + s('critDmg') / 100,
    dmgMul: 1 + (s('dmg') + giant + glass + blood) / 100,
    atkSpeed: Math.max(0.4, 1 + s('atkSpd') / 100 - (giant ? 0.15 : 0)),
    reachMul: 1 + (s('reach') + giant) / 100,
    lifeSteal: (s('lifeSteal') + (rules.get('vampiric') ?? 0)) / 100,
    lifeKill: s('lifeKill'),
    goldMul: Math.max(0, 1 + s('gold') / 100),
    skillCdMul: Math.max(0.3, 1 - s('skillCd') / 100),
    skillDmg: 1 + s('skillDmg') / 100,
    aoe: 1 + (s('aoe') + giant * 0.5) / 100,
    statusDur: 1 + s('statusDur') / 100 + (mastery ? 0.3 : 0),
    flaskMul: Math.max(0.2, 1 + s('flask') / 100),
    proj: s('proj'),
    build: s('build'),
    elBuild,
    elDmg,
    procs,
    conds,
    rules,
  };
}

export function weaponStats(p: Player, slot: 0 | 1 = p.weaponIndex): WeaponStats | null {
  const item = p.loadout.weapons[slot];
  if (!item || !item.family) return null;
  const fam = FAMILIES[item.family];
  const v = variantOf(item.family, item.variant);
  // Weapon stat props are already folded into the build (the active weapon's props count).
  return {
    item,
    family: item.family,
    fam,
    combo: comboFor(item.family, item.variant),
    damage: item.damage ?? 1,
    speedMul: v.speed * p.build.atkSpeed * (p.hasteT > 0 ? 1 + p.hastePct / 100 : 1) * (p.warcryT > 0 ? 1 + p.warcryPct / 100 : 1),
    reachMul: p.build.reachMul,
    crit: v.crit / 100,
    procBase: Math.max(4, sustainedDps({ ...item, props: [] }) * 0.5),
  };
}

export function refreshBuild(p: Player): void {
  const before = p.build?.maxHp ?? p.hp;
  p.build = computeBuild(p);
  if (p.build.maxHp > before) p.hp += p.build.maxHp - before;
  p.hp = Math.min(p.hp, p.build.maxHp);
}

export function bagFree(p: Player): number {
  return p.bag.indexOf(null);
}

/**
 * Equip an item. Returns the displaced item (if any) so the caller can store or drop it.
 * `slotIndex` chooses which weapon/ring slot to replace.
 */
export function equipItem(p: Player, item: Item, slotIndex?: 0 | 1): Item | null {
  const l = p.loadout;
  let displaced: Item | null = null;
  if (item.slot === 'weapon') {
    const idx = slotIndex ?? (l.weapons[p.weaponIndex] ? (l.weapons[1 - p.weaponIndex] ? p.weaponIndex : ((1 - p.weaponIndex) as 0 | 1)) : p.weaponIndex);
    displaced = l.weapons[idx];
    l.weapons[idx] = item;
  } else if (item.slot === 'ring') {
    const idx = slotIndex ?? (l.rings[0] ? (l.rings[1] ? 0 : 1) : 0);
    displaced = l.rings[idx];
    l.rings[idx] = item;
  } else if (item.slot === 'chest') {
    displaced = l.chest;
    l.chest = item;
  } else if (item.slot === 'boots') {
    displaced = l.boots;
    l.boots = item;
  } else {
    displaced = l.relic;
    l.relic = item;
    p.relicCd = Math.min(p.relicCd, 2);
  }
  return displaced;
}

export function equippedFor(p: Player, item: Item, slotIndex?: 0 | 1): Item | null {
  const l = p.loadout;
  if (item.slot === 'weapon') return l.weapons[slotIndex ?? p.weaponIndex];
  if (item.slot === 'ring') return l.rings[slotIndex ?? 0];
  if (item.slot === 'chest') return l.chest;
  if (item.slot === 'boots') return l.boots;
  return l.relic;
}
