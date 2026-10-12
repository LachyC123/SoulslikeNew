import { FAMILIES, hasAffix, Item, itemSpeedMul, WeaponFamily } from '../data/items';
import { Loadout, loadoutItems } from '../data/synergy';

export const BAG_SIZE = 12;
export const BASE_HP = 100;

export interface StatusState {
  build: number;
  idle: number;
  active: number;
  tick: number;
  /** Threshold multiplier: grows after each activation (repeated control resistance). */
  resist: number;
}

export const newStatus = (): StatusState => ({ build: 0, idle: 0, active: 0, tick: 0, resist: 1 });

export interface Build {
  maxHp: number;
  defense: number;
  moveMul: number;
  dodgeCdMul: number;
  crit: number;
  critBonus: number;
  dmgMul: number;
  flaskMul: number;
  poisonBuildMul: number;
  frostBuildMul: number;
  poisonDmgMul: number;
  frostNova: number;
  sporeBloom: number;
  shadowEcho: number;
  frostStep: number;
  thorns: number;
  warding: number;
}

export interface WeaponStats {
  item: Item;
  family: WeaponFamily;
  damage: number;
  speedMul: number;
  reachMul: number;
  crit: number;
  heavy: boolean;
  /** Which combo steps shatter frozen foes. */
  shatterAll: boolean;
  shatterFinisher: boolean;
  reaper: number;
  rimed: number;
}

export type PlayerState = 'free' | 'attack' | 'dodge' | 'skill' | 'flask' | 'dead';

export interface Player {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  /** Facing angle (radians); dir4 is the sprite direction 0=down 1=up 2=left 3=right. */
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
  // attack
  atkStep: number;
  atkPhase: 'windup' | 'active' | 'recovery';
  atkT: number;
  atkDir: number;
  atkId: number;
  atkQueued: boolean;
  comboIdle: number;
  targetId: number | null;
  echoPending: boolean;
  echoArmed: boolean;
  // dodge
  dodgeDx: number;
  dodgeDy: number;
  dodgeCd: number;
  invuln: number;
  hurtT: number;
  // skill
  skillId: string;
  skillCd: [number, number];
  skillDir: number;
  skillHit: boolean;
  // equipment
  weaponIndex: 0 | 1;
  swapLock: number;
  loadout: Loadout;
  bag: (Item | null)[];
  build: Build;
  poison: StatusState;
  causeOfDeath: string;
  // presentation hints
  flash: number;
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
    comboIdle: 0,
    targetId: null,
    echoPending: false,
    echoArmed: false,
    dodgeDx: 0,
    dodgeDy: 1,
    dodgeCd: 0,
    invuln: 0,
    hurtT: 0,
    skillId: '',
    skillCd: [0, 0],
    skillDir: 0,
    skillHit: false,
    weaponIndex: 0,
    swapLock: 0,
    loadout: { weapons: [starter, null], chest: null, boots: null, rings: [null, null] },
    bag: new Array(BAG_SIZE).fill(null),
    build: null as unknown as Build,
    poison: newStatus(),
    causeOfDeath: '',
    flash: 0,
  };
  p.build = computeBuild(p.loadout, bonusHp);
  p.hp = p.build.maxHp;
  return p;
}

export function computeBuild(l: Loadout, bonusHp: number): Build {
  const items = loadoutItems(l).filter((i) => i.slot !== 'weapon');
  const venom = Math.max(0, ...l.weapons.map((w) => hasAffix(w, 'venomous')));
  const sum = (id: Parameters<typeof hasAffix>[1]) => items.reduce((s, i) => s + hasAffix(i, id), 0);
  return {
    maxHp: BASE_HP + bonusHp + sum('vitality'),
    defense: l.chest?.defense ?? 0,
    moveMul: 1 + sum('fleet') / 100,
    dodgeCdMul: 1 - sum('quickstep') / 100,
    crit: 0.05 + sum('critChance') / 100,
    critBonus: 0.5 + sum('luckyStrike') / 100,
    dmgMul: 1 + sum('bloodPrice') / 100,
    flaskMul: sum('bloodPrice') > 0 ? 0.75 : 1,
    poisonBuildMul: 1 + sum('venomHeart') / 100,
    frostBuildMul: 1 + sum('rimeHeart') / 100,
    poisonDmgMul: 1 + venom / 100,
    frostNova: sum('frostNova'),
    sporeBloom: sum('sporeBloom'),
    shadowEcho: sum('shadowEcho'),
    frostStep: sum('frostStep'),
    thorns: sum('thorns'),
    warding: sum('warding'),
  };
}

export function weaponStats(p: Player, slot: 0 | 1 = p.weaponIndex): WeaponStats | null {
  const item = p.loadout.weapons[slot];
  if (!item || !item.family) return null;
  const fam = FAMILIES[item.family];
  return {
    item,
    family: item.family,
    damage: item.damage ?? 1,
    speedMul: itemSpeedMul(item),
    reachMul: 1 + hasAffix(item, 'keen') / 100,
    crit: hasAffix(item, 'critChance') / 100,
    heavy: fam.heavy,
    shatterAll: fam.heavy,
    shatterFinisher: hasAffix(item, 'shatterer') > 0,
    reaper: hasAffix(item, 'reaper'),
    rimed: hasAffix(item, 'rimed') / 100,
  };
}

export function refreshBuild(p: Player, bonusHp: number): void {
  const before = p.build?.maxHp ?? p.hp;
  p.build = computeBuild(p.loadout, bonusHp);
  // Gaining max HP grants the difference; losing it clamps.
  if (p.build.maxHp > before) p.hp += p.build.maxHp - before;
  p.hp = Math.min(p.hp, p.build.maxHp);
}

export function bagFree(p: Player): number {
  return p.bag.indexOf(null);
}

export function bagCount(p: Player): number {
  return p.bag.filter(Boolean).length;
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
  } else {
    displaced = l.boots;
    l.boots = item;
  }
  return displaced;
}

export function equippedFor(p: Player, item: Item, slotIndex?: 0 | 1): Item | null {
  const l = p.loadout;
  if (item.slot === 'weapon') return l.weapons[slotIndex ?? p.weaponIndex];
  if (item.slot === 'ring') return l.rings[slotIndex ?? 0];
  if (item.slot === 'chest') return l.chest;
  return l.boots;
}
