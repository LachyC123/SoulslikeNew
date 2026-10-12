import type { EnemyKind } from '../world/gen';

export type EnemyAttackKind = 'slam' | 'shoot' | 'lunge';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  /** Poise before stagger. */
  poise: number;
  /** Status thresholds. */
  resist: { poison: number; frost: number };
  flying: boolean;
  /** Preferred distance from the player (ranged units back off). */
  keepDistance: number;
  attack: {
    kind: EnemyAttackKind;
    range: number;
    windup: number;
    active: number;
    recovery: number;
    cooldown: number;
    damage: number;
    /** Slam: radius & offset. Lunge: travel speed. Shoot: projectile speed. */
    size: number;
    offset: number;
    buildup?: { kind: 'poison' | 'frost'; amount: number };
  };
  gold: [number, number];
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  root: {
    kind: 'root',
    name: 'Rootling',
    hp: 50,
    speed: 30,
    radius: 7,
    poise: 30,
    resist: { poison: 90, frost: 70 },
    flying: false,
    keepDistance: 0,
    attack: { kind: 'slam', range: 28, windup: 0.75, active: 0.12, recovery: 0.6, cooldown: 1.0, damage: 14, size: 15, offset: 13 },
    gold: [2, 4],
  },
  moth: {
    kind: 'moth',
    name: 'Lantern Moth',
    hp: 30,
    speed: 40,
    radius: 6,
    poise: 15,
    resist: { poison: 75, frost: 60 },
    flying: true,
    keepDistance: 72,
    attack: {
      kind: 'shoot',
      range: 130,
      windup: 0.65,
      active: 0.1,
      recovery: 0.5,
      cooldown: 2.1,
      damage: 7,
      size: 95,
      offset: 0,
      buildup: { kind: 'poison', amount: 38 },
    },
    gold: [3, 5],
  },
  thornling: {
    kind: 'thornling',
    name: 'Thornling',
    hp: 36,
    speed: 50,
    radius: 6,
    poise: 18,
    resist: { poison: 80, frost: 65 },
    flying: false,
    keepDistance: 0,
    attack: { kind: 'lunge', range: 64, windup: 0.55, active: 0.3, recovery: 0.75, cooldown: 1.5, damage: 12, size: 210, offset: 0 },
    gold: [2, 5],
  },
};

export const BOSS = {
  name: 'The Thorn Warden',
  hp: 640,
  radius: 14,
  speed: 34,
  resist: { poison: 160, frost: 150 },
};
