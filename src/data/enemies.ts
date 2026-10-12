import type { EnemyKind } from '../world/gen';

export type EnemyAttackKind = 'slam' | 'shoot' | 'lunge' | 'thrust' | 'mortar' | 'charge';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  poise: number;
  resist: { poison: number; frost: number; burn: number; shock: number };
  flying: boolean;
  keepDistance: number;
  /** Damage multiplier for hits landing on its front (armoured blockers). */
  frontGuard?: number;
  /** Periodically mends nearby allies. */
  healer?: boolean;
  attack: {
    kind: EnemyAttackKind;
    range: number;
    windup: number;
    active: number;
    recovery: number;
    cooldown: number;
    damage: number;
    /** slam: radius · shoot/mortar: projectile speed · lunge/charge: travel speed · thrust: lane length */
    size: number;
    offset: number;
    /** Shots fired at once. */
    count?: number;
    buildup?: { kind: 'poison' | 'frost' | 'burn'; amount: number };
  };
  gold: [number, number];
  cost: number;
}

const R = (poison: number, frost: number, burn: number, shock: number) => ({ poison, frost, burn, shock });

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  root: {
    kind: 'root',
    name: 'Rootling',
    hp: 72,
    speed: 36,
    radius: 7,
    poise: 34,
    resist: R(90, 75, 80, 85),
    flying: false,
    keepDistance: 0,
    attack: { kind: 'slam', range: 30, windup: 0.62, active: 0.12, recovery: 0.5, cooldown: 0.8, damage: 21, size: 16, offset: 13 },
    gold: [2, 5],
    cost: 1,
  },
  moth: {
    kind: 'moth',
    name: 'Lantern Moth',
    hp: 44,
    speed: 46,
    radius: 6,
    poise: 16,
    resist: R(75, 60, 70, 60),
    flying: true,
    keepDistance: 80,
    attack: { kind: 'shoot', range: 150, windup: 0.55, active: 0.1, recovery: 0.4, cooldown: 1.6, damage: 12, size: 115, offset: 0, buildup: { kind: 'poison', amount: 40 } },
    gold: [3, 6],
    cost: 1.4,
  },
  thornling: {
    kind: 'thornling',
    name: 'Thornling',
    hp: 52,
    speed: 58,
    radius: 6,
    poise: 20,
    resist: R(80, 65, 70, 70),
    flying: false,
    keepDistance: 0,
    attack: { kind: 'lunge', range: 70, windup: 0.46, active: 0.3, recovery: 0.6, cooldown: 1.1, damage: 18, size: 240, offset: 0 },
    gold: [2, 5],
    cost: 1.2,
  },
  sentinel: {
    kind: 'sentinel',
    name: 'Moss Sentinel',
    hp: 150,
    speed: 28,
    radius: 8,
    poise: 90,
    resist: R(110, 100, 100, 90),
    flying: false,
    keepDistance: 0,
    frontGuard: 0.45,
    attack: { kind: 'thrust', range: 58, windup: 0.7, active: 0.14, recovery: 0.6, cooldown: 1.2, damage: 28, size: 70, offset: 0 },
    gold: [5, 9],
    cost: 2.2,
  },
  bulb: {
    kind: 'bulb',
    name: 'Spore Bulb',
    hp: 64,
    speed: 14,
    radius: 7,
    poise: 40,
    resist: R(200, 70, 60, 80),
    flying: false,
    keepDistance: 110,
    attack: { kind: 'mortar', range: 175, windup: 0.75, active: 0.1, recovery: 0.6, cooldown: 2.1, damage: 16, size: 22, offset: 0, buildup: { kind: 'poison', amount: 50 } },
    gold: [3, 6],
    cost: 1.5,
  },
  wisp: {
    kind: 'wisp',
    name: 'Cinder Wisp',
    hp: 40,
    speed: 50,
    radius: 6,
    poise: 14,
    resist: R(70, 50, 200, 70),
    flying: true,
    keepDistance: 95,
    healer: true,
    attack: { kind: 'shoot', range: 150, windup: 0.5, active: 0.1, recovery: 0.35, cooldown: 1.8, damage: 13, size: 130, offset: 0, count: 1, buildup: { kind: 'burn', amount: 45 } },
    gold: [3, 7],
    cost: 1.6,
  },
  beetle: {
    kind: 'beetle',
    name: 'Shellback',
    hp: 110,
    speed: 30,
    radius: 8,
    poise: 70,
    resist: R(90, 80, 90, 90),
    flying: false,
    keepDistance: 0,
    attack: { kind: 'charge', range: 120, windup: 0.68, active: 0.5, recovery: 0.55, cooldown: 1.5, damage: 26, size: 270, offset: 0 },
    gold: [4, 8],
    cost: 1.8,
  },
};

export type Mutation = 'armored' | 'hasted' | 'vampiric' | 'splitter' | 'volatile' | 'venomous' | 'frostbound' | 'blazing' | 'warded' | 'berserk' | 'giant' | 'regen';

export const MUTATIONS: Record<Mutation, { name: string; color: string; desc: string }> = {
  armored: { name: 'Armoured', color: '#b8c0cc', desc: 'Takes 35% less damage' },
  hasted: { name: 'Swift', color: '#ffe27a', desc: 'Faster movement and attacks' },
  vampiric: { name: 'Vampiric', color: '#e04a5a', desc: 'Heals when it hits you' },
  splitter: { name: 'Splitting', color: '#b8e07a', desc: 'Splits in two on death' },
  volatile: { name: 'Volatile', color: '#ff8a3a', desc: 'Explodes on death' },
  venomous: { name: 'Venomous', color: '#9cf05a', desc: 'Attacks poison you' },
  frostbound: { name: 'Frostbound', color: '#9ae8ff', desc: 'Attacks chill you' },
  blazing: { name: 'Blazing', color: '#ffae4a', desc: 'Attacks set you alight' },
  warded: { name: 'Warded', color: '#c8b0ff', desc: 'Protected by a ward' },
  berserk: { name: 'Raging', color: '#ff5a3a', desc: 'Enrages when hurt' },
  giant: { name: 'Hulking', color: '#d8c8a0', desc: 'Huge and tough' },
  regen: { name: 'Regrowing', color: '#7ae08a', desc: 'Regenerates out of combat' },
};

export const BOSS = {
  name: 'The Thorn Warden',
  hp: 1500,
  radius: 14,
  speed: 40,
  resist: { poison: 180, frost: 170, burn: 170, shock: 170 },
};

/** Floor scaling: the descent gets much harder. */
export const floorHp = (floor: number) => 1 + (floor - 1) * 0.32;
export const floorDmg = (floor: number) => 1 + (floor - 1) * 0.22;
