import { angleDiff, damp, norm } from '../core/math';
import { Rng } from '../core/rng';
import { BOSS, EnemyDef, ENEMIES, floorDmg, floorHp, Mutation, MUTATIONS } from '../data/enemies';
import { Element, StatusEl } from '../data/elements';
import { Item } from '../data/items';
import { Trigger } from '../data/props';
import { AttackStep, ProjKind } from '../data/weapons';
import { EnemyKind, FloorPlan } from '../world/gen';
import { Room, T, TILE, TileMap } from '../world/tiles';
import { doEffect, echoSwing, updateAllies, useRelic } from './effects';
import { newStatus, Player, refreshBuild, StatusState, weaponStats, WeaponStats } from './player';

// ---------------------------------------------------------------------------
// Presentation sink: simulation reports what happened, presentation decides how it looks.

export type NumKind = 'hit' | 'crit' | 'hurt' | 'heal' | 'poison' | 'shatter' | 'gold' | 'burn' | 'shock' | 'shield' | 'proc' | 'block';
export type BurstKind =
  | 'hit'
  | 'heavyHit'
  | 'shatter'
  | 'freeze'
  | 'spores'
  | 'poisonTick'
  | 'burnTick'
  | 'shockTick'
  | 'ignite'
  | 'electrify'
  | 'death'
  | 'dust'
  | 'fracture'
  | 'heal'
  | 'chest'
  | 'sparkle'
  | 'leaves'
  | 'frostStep'
  | 'erupt'
  | 'bossDeath'
  | 'roar'
  | 'nova'
  | 'explosion'
  | 'meteor'
  | 'blink'
  | 'summon'
  | 'shield'
  | 'haste'
  | 'roomClear'
  | 'legendary'
  | 'muzzle'
  | 'ward'
  | 'split';
export type SoundId =
  | 'swing'
  | 'swingHeavy'
  | 'hit'
  | 'heavyHit'
  | 'crit'
  | 'shatter'
  | 'dodge'
  | 'hurt'
  | 'enemyWarn'
  | 'shoot'
  | 'death'
  | 'pickup'
  | 'gold'
  | 'chest'
  | 'heal'
  | 'skill'
  | 'freeze'
  | 'poison'
  | 'swap'
  | 'stairs'
  | 'bossRoar'
  | 'erupt'
  | 'gate'
  | 'ui'
  | 'bow'
  | 'zap'
  | 'fire'
  | 'boom'
  | 'magic'
  | 'shield'
  | 'legendary'
  | 'combo';

export interface FxSink {
  number(x: number, y: number, text: string, kind: NumKind): void;
  burst(kind: BurstKind, x: number, y: number, angle?: number, scale?: number, el?: Element): void;
  sound(id: SoundId, vol?: number): void;
  shake(amount: number): void;
  hitstop(t: number): void;
  toast(msg: string, kind?: 'info' | 'synergy' | 'warn'): void;
  /** A line effect: lightning arcs, heal beams. */
  beam(x1: number, y1: number, x2: number, y2: number, el: Element, kind: 'chain' | 'heal'): void;
  /** Pixel disintegration of a dying enemy. */
  death(e: Enemy): void;
  /** Big centred callouts (multi-kills, room clear). */
  callout(text: string, tier: number): void;
}

export const nullFx: FxSink = {
  number() {},
  burst() {},
  sound() {},
  shake() {},
  hitstop() {},
  toast() {},
  beam() {},
  death() {},
  callout() {},
};

export interface Intent {
  mx: number;
  my: number;
  aim: number | null;
  attack: boolean;
  attackHeld: boolean;
  dodge: boolean;
  skill: boolean;
  swap: boolean;
  flask: boolean;
  relic: boolean;
  interact: boolean;
  interactHeld: boolean;
}

export const emptyIntent = (): Intent => ({
  mx: 0,
  my: 0,
  aim: null,
  attack: false,
  attackHeld: false,
  dodge: false,
  skill: false,
  swap: false,
  flask: false,
  relic: false,
  interact: false,
  interactHeld: false,
});

// ---------------------------------------------------------------------------

export interface Src {
  effect: string;
  chain: string[];
}

export type BossMove = 'sweep' | 'charge' | 'erupt' | 'roar';

export interface BossState {
  phase: 1 | 2;
  move: BossMove | null;
  last: BossMove[];
  marks: { x: number; y: number }[];
  stunned: number;
  chill: number;
  chargeLen: number;
  chargeDist: number;
  followUp: boolean;
  awake: boolean;
  summons: number;
}

export type EnemyState = 'idle' | 'chase' | 'windup' | 'active' | 'recover' | 'stagger' | 'dead';

export interface Enemy {
  id: number;
  kind: EnemyKind | 'boss';
  def: EnemyDef | null;
  name: string;
  x: number;
  y: number;
  r: number;
  scale: number;
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  hp: number;
  maxHp: number;
  poise: number;
  poiseMax: number;
  speed: number;
  dmgMul: number;
  windMul: number;
  state: EnemyState;
  t: number;
  cd: number;
  aim: number;
  ax: number;
  ay: number;
  facing: 1 | -1;
  aggro: boolean;
  room: number;
  elite: boolean;
  mutations: Mutation[];
  ward: number;
  small: boolean;
  poison: StatusState;
  frost: StatusState;
  burn: StatusState;
  shock: StatusState;
  resistBase: { poison: number; frost: number; burn: number; shock: number };
  flash: number;
  squash: number;
  anim: number;
  token: boolean;
  lastHit: number;
  lastHurtT: number;
  deadT: number;
  hitPlayer: boolean;
  healCd: number;
  boss: BossState | null;
}

export interface HitSpec {
  dmg: number;
  el: Element;
  el2?: Element;
  build: number;
  poise: number;
  knock: number;
  dir: number;
  heavy: boolean;
  kind: 'attack' | 'skill' | 'proc' | 'ally';
  finisher?: boolean;
  src: Src;
}

export interface Projectile {
  id: number;
  owner: 'player' | 'enemy';
  kind: ProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  hit: HitSpec | null;
  damage: number;
  buildup: { kind: 'poison' | 'frost' | 'burn'; amount: number } | null;
  pierce: number;
  hits: Map<number, number>;
  rehit: number;
  returns: boolean;
  returning: boolean;
  homing: number;
  el: Element;
  cause: string;
  tx?: number;
  ty?: number;
  sx?: number;
  sy?: number;
}

export type HazardKind = 'eruption' | 'sporeCloud' | 'mortar' | 'puddle' | 'meteor' | 'vortex' | 'cloud' | 'strike' | 'blast';

export interface Hazard {
  kind: HazardKind;
  owner: 'player' | 'enemy';
  x: number;
  y: number;
  r: number;
  warn: number;
  warnTotal: number;
  active: number;
  activeTotal: number;
  damage: number;
  buildup: number;
  el: Element;
  tick: number;
  done: boolean;
  src: Src;
  cause: string;
}

export interface Pickup {
  id: number;
  kind: 'item' | 'gold' | 'orb';
  x: number;
  y: number;
  z: number;
  vz: number;
  vx: number;
  vy: number;
  item?: Item;
  amount: number;
  t: number;
}

export interface Chest {
  id: number;
  x: number;
  y: number;
  opened: boolean;
  guarded: boolean;
  t: number;
  room: number;
}

export interface Feature {
  id: number;
  kind: 'spring' | 'shrine' | 'merchant';
  x: number;
  y: number;
  used: boolean;
  room: number;
}

export interface Ally {
  id: number;
  kind: 'wisp' | 'spirit' | 'turret' | 'orbit' | 'decoy';
  x: number;
  y: number;
  t: number;
  life: number;
  el: Element;
  power: number;
  cd: number;
  angle: number;
  hits: Map<number, number>;
}

export type Interactable = { kind: 'chest'; chest: Chest } | { kind: 'item'; pickup: Pickup } | { kind: 'feature'; feature: Feature } | { kind: 'stairs' };

export interface WorldCallbacks {
  inspect(p: Pickup): void;
  descend(): void;
  rollChestLoot(chest: Chest): Item;
  bossDefeated(): void;
  playerDied(): void;
  milestone(kind: 'kill' | 'boss' | 'room', amount: number): void;
  feature(f: Feature): void;
}

export interface FloorStateSave {
  opened: number[];
  killed: number[];
  springs: number[];
  ground: { x: number; y: number; item: Item }[];
  explored: number[];
  bossDead: boolean;
}

export interface FloorMods {
  id: string;
  name: string;
  desc: string;
  hpMul: number;
  mutationBonus: number;
  forced: Mutation | null;
  goldMul: number;
  lootBonus: number;
  aggroMul: number;
}

export const NO_MODS: FloorMods = { id: 'none', name: '', desc: '', hpMul: 1, mutationBonus: 0, forced: null, goldMul: 1, lootBonus: 0, aggroMul: 1 };

const MAX_ATTACK_TOKENS = 3;
const PLAYER_SPEED = 76;
const DODGE_TIME = 0.3;
const DODGE_DIST = 54;
const DODGE_IFRAMES = 0.24;
const DODGE_CD = 0.42;
const HURT_PROTECT = 0.55;
const MUT_LIST = Object.keys(MUTATIONS) as Mutation[];

export class World {
  readonly map: TileMap;
  readonly rooms: Room[];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  pickups: Pickup[] = [];
  chests: Chest[] = [];
  features: Feature[] = [];
  allies: Ally[] = [];
  explored: Uint8Array;
  time = 0;
  tokens = 0;
  stairsOpen: boolean;
  bossFight: 'none' | 'active' | 'done' = 'none';
  gates: { x: number; y: number }[] = [];
  descendHold = 0;
  nearby: Interactable | null = null;
  nextId = 10000;
  killed = new Set<number>();
  kills = 0;
  slowT = 0;
  combo = 0;
  comboT = 0;
  bestCombo = 0;
  multiKill = 0;
  multiT = 0;
  echoQueue: { t: number; fn: () => void }[] = [];
  pulseT = new Map<string, number>();
  roomAlive = new Map<number, number>();
  rng: Rng;
  private flow: Int16Array;
  private flowT = 0;
  private flowTile = -1;

  constructor(
    readonly plan: FloorPlan,
    readonly player: Player,
    readonly fx: FxSink,
    readonly cb: WorldCallbacks,
    combatSeed: number,
    saved?: FloorStateSave,
    readonly mods: FloorMods = NO_MODS,
  ) {
    this.map = plan.map;
    this.rooms = plan.rooms;
    this.explored = new Uint8Array(plan.rooms.length);
    this.flow = new Int16Array(this.map.w * this.map.h);
    this.rng = new Rng(combatSeed);
    this.stairsOpen = !plan.boss;

    for (const s of plan.enemies) {
      if (saved?.killed.includes(s.id)) continue;
      this.enemies.push(this.makeEnemy(s.id, s.kind, s.x, s.y, s.room, s.elite));
    }
    for (const e of this.enemies) this.roomAlive.set(e.room, (this.roomAlive.get(e.room) ?? 0) + 1);
    for (const c of plan.chests) this.chests.push({ id: c.id, x: c.x, y: c.y, opened: !!saved?.opened.includes(c.id), guarded: c.guarded, t: 1, room: c.room });
    for (const f of plan.features) this.features.push({ id: f.id, kind: f.kind, x: f.x, y: f.y, used: !!saved?.springs.includes(f.id), room: f.room });
    if (plan.boss && !saved?.bossDead) this.enemies.push(this.makeBoss(plan.boss.x, plan.boss.y, plan.boss.room));
    if (saved?.bossDead) {
      this.bossFight = 'done';
      this.stairsOpen = true;
    }
    if (saved) {
      saved.killed.forEach((k) => this.killed.add(k));
      for (const g of saved.ground) this.dropItem(g.item, g.x, g.y, false);
      saved.explored.forEach((r) => (this.explored[r] = 1));
    }
    player.x = plan.spawn.x;
    player.y = plan.spawn.y;
    player.phoenixUsed = false;
  }

  // -------------------------------------------------------------------------
  // Construction helpers

  makeEnemy(id: number, kind: EnemyKind, x: number, y: number, room: number, elite: boolean, small = false): Enemy {
    const def = ENEMIES[kind];
    const fl = this.plan.floor;
    const muts: Mutation[] = [];
    const rng = new Rng(id * 7919 + fl * 104729 + this.plan.seed);
    const nMut = elite ? 2 : rng.chance(Math.min(0.75, 0.12 + (fl - 1) * 0.2 + this.mods.mutationBonus)) ? 1 : 0;
    if (this.mods.forced && !(small && this.mods.forced === 'splitter')) muts.push(this.mods.forced);
    let guard = 0;
    while (muts.length < nMut + (this.mods.forced ? 1 : 0) && guard++ < 20) {
      const m = rng.pick(MUT_LIST);
      if (!muts.includes(m) && !(small && (m === 'splitter' || m === 'giant'))) muts.push(m);
    }
    const has = (m: Mutation) => muts.includes(m);
    const hp = Math.round(def.hp * floorHp(fl) * this.mods.hpMul * (elite ? 2.2 : 1) * (has('giant') ? 1.6 : 1) * (small ? 0.35 : 1));
    const scale = (elite ? 1.18 : 1) * (has('giant') ? 1.4 : 1) * (small ? 0.72 : 1);
    const prefix = muts.map((m) => MUTATIONS[m].name).join(' ');
    const poise = def.poise * (elite ? 2 : 1) * (has('giant') ? 2 : 1);
    return {
      id,
      kind,
      def,
      name: `${elite ? 'Elite ' : ''}${prefix ? prefix + ' ' : ''}${def.name}`,
      x,
      y,
      r: def.radius * scale,
      scale,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      hp,
      maxHp: hp,
      poise,
      poiseMax: poise,
      speed: def.speed * (elite ? 1.08 : 1) * (has('hasted') ? 1.4 : 1) * (has('giant') ? 0.85 : 1),
      dmgMul: floorDmg(fl) * (elite ? 1.35 : 1) * (has('giant') ? 1.3 : 1),
      windMul: has('hasted') ? 0.8 : 1,
      state: 'idle',
      t: 0,
      cd: 0.4 + ((id * 37) % 10) / 12,
      aim: 0,
      ax: x,
      ay: y,
      facing: 1,
      aggro: false,
      room,
      elite,
      mutations: muts,
      ward: has('warded') ? Math.round(hp * 0.4) : 0,
      small,
      poison: newStatus(),
      frost: newStatus(),
      burn: newStatus(),
      shock: newStatus(),
      resistBase: { ...def.resist },
      flash: 0,
      squash: 0,
      anim: (id * 0.37) % 1,
      token: false,
      lastHit: -1,
      lastHurtT: -10,
      deadT: 0,
      hitPlayer: false,
      healCd: 2,
      boss: null,
    };
  }

  private makeBoss(x: number, y: number, room: number): Enemy {
    const hp = Math.round(BOSS.hp * this.mods.hpMul);
    return {
      id: 1,
      kind: 'boss',
      def: null,
      name: BOSS.name,
      x,
      y,
      r: BOSS.radius,
      scale: 1,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      hp,
      maxHp: hp,
      poise: 9999,
      poiseMax: 9999,
      speed: BOSS.speed,
      dmgMul: 1.5,
      windMul: 1,
      state: 'idle',
      t: 0,
      cd: 0,
      aim: Math.PI / 2,
      ax: x,
      ay: y,
      facing: 1,
      aggro: false,
      room,
      elite: false,
      mutations: [],
      ward: 0,
      small: false,
      poison: newStatus(),
      frost: newStatus(),
      burn: newStatus(),
      shock: newStatus(),
      resistBase: { ...BOSS.resist },
      flash: 0,
      squash: 0,
      anim: 0,
      token: false,
      lastHit: -1,
      lastHurtT: -10,
      deadT: 0,
      hitPlayer: false,
      healCd: 0,
      boss: { phase: 1, move: null, last: [], marks: [], stunned: 0, chill: 0, chargeLen: 0, chargeDist: 0, followUp: false, awake: false, summons: 0 },
    };
  }

  get boss(): Enemy | undefined {
    return this.enemies.find((e) => e.boss && e.state !== 'dead');
  }

  has(e: Enemy, m: Mutation): boolean {
    return e.mutations.includes(m);
  }

  dropItem(item: Item, x: number, y: number, pop = true): Pickup {
    const p: Pickup = { id: this.nextId++, kind: 'item', x, y, z: pop ? 2 : 0, vz: pop ? 70 : 0, vx: pop ? (Math.random() - 0.5) * 30 : 0, vy: pop ? 18 : 0, item, amount: 1, t: 0 };
    this.pickups.push(p);
    if (pop && (item.rarity === 'mythic' || item.rarity === 'epic')) {
      this.fx.burst('legendary', x, y - 6, 0, item.rarity === 'mythic' ? 1.6 : 1);
      this.fx.sound('legendary');
      if (item.rarity === 'mythic') this.fx.callout('MYTHIC FIND', 3);
    }
    return p;
  }

  dropGold(x: number, y: number, amount: number) {
    amount = Math.max(1, Math.round(amount * this.player.build.goldMul * this.mods.goldMul));
    const coins = Math.min(6, Math.max(1, Math.round(amount / 3)));
    for (let i = 0; i < coins; i++) {
      const a = Math.random() * Math.PI * 2;
      this.pickups.push({ id: this.nextId++, kind: 'gold', x, y, z: 2, vz: 60 + Math.random() * 30, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, amount: Math.max(1, Math.round(amount / coins)), t: 0 });
    }
  }

  saveState(): FloorStateSave {
    return {
      opened: this.chests.filter((c) => c.opened).map((c) => c.id),
      killed: [...this.killed],
      springs: this.features.filter((s) => s.used).map((s) => s.id),
      ground: this.pickups.filter((p) => p.kind === 'item' && p.item).map((p) => ({ x: p.x, y: p.y, item: p.item! })),
      explored: [...this.explored].map((v, i) => (v ? i : -1)).filter((i) => i >= 0),
      bossDead: this.bossFight === 'done',
    };
  }

  // -------------------------------------------------------------------------
  // Main update

  update(dt: number, intent: Intent): void {
    this.time += dt;
    const p = this.player;
    this.slowT = Math.max(0, this.slowT - dt);
    const edt = this.slowT > 0 ? dt * 0.4 : dt;
    this.updatePlayer(dt, intent);
    this.updateExplored();
    this.updateFlowField(dt);
    this.updateBossTrigger();
    updateAllies(this, dt);
    this.tokens = this.enemies.filter((e) => e.token).length;
    for (const e of this.enemies) {
      if (e.boss) this.updateBoss(e, edt);
      else this.updateEnemy(e, edt);
      this.updateStatuses(e, dt);
    }
    this.enemies = this.enemies.filter((e) => !(e.state === 'dead' && e.deadT > 0.05));
    this.updateProjectiles(dt, edt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updatePlayerStatus(dt);
    this.updatePulses(dt);
    this.updateInteract(dt, intent);
    for (const c of this.chests) c.t += dt;
    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;
    this.multiT -= dt;
    if (this.multiT <= 0 && this.multiKill) {
      const n = this.multiKill;
      if (n >= 5) this.fx.callout(`MASSACRE ×${n}`, 3);
      else if (n === 4) this.fx.callout('QUADRA KILL', 2);
      else if (n === 3) this.fx.callout('TRIPLE KILL', 2);
      else if (n === 2) this.fx.callout('DOUBLE KILL', 1);
      this.multiKill = 0;
    }
    if (this.echoQueue.length) {
      const due = this.echoQueue.filter((q) => q.t <= this.time);
      this.echoQueue = this.echoQueue.filter((q) => q.t > this.time);
      for (const q of due) q.fn();
    }
    if (p.hp <= 0 && p.state !== 'dead') {
      if (p.build.rules.has('phoenix') && !p.phoenixUsed) {
        p.phoenixUsed = true;
        p.hp = Math.round(p.build.maxHp * 0.5);
        p.invuln = 1.5;
        this.fx.callout('PHOENIX RISES', 3);
        this.fx.sound('legendary');
        doEffect(this, { k: 'proc', trig: 'hurt', chance: 1, n: 0, effect: 'nova', el: 'burn', power: 3, count: 1, icd: 0 }, p.x, p.y, null, { effect: 'phoenix', chain: ['phoenix'] });
        return;
      }
      p.state = 'dead';
      p.stateT = 0;
      this.fx.sound('death');
      this.fx.burst('death', p.x, p.y - 6);
      this.cb.playerDied();
    }
  }

  private updateExplored() {
    const p = this.player;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    for (const r of this.rooms) {
      if (tx >= r.x - 2 && tx < r.x + r.w + 2 && ty >= r.y - 2 && ty < r.y + r.h + 2 && !this.explored[r.id]) {
        this.explored[r.id] = 1;
        if (r.role === 'exit') this.fx.toast('You found the stairs.', 'info');
        if (r.role === 'boss') this.fx.toast('A great presence stirs beyond.', 'warn');
        if (r.role === 'shop') this.fx.toast('A travelling merchant has set up camp here.', 'info');
        if (r.role === 'shrine') this.fx.toast('A cursed shrine hums with promise.', 'info');
      }
    }
  }

  roomAt(x: number, y: number): Room | null {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    for (const r of this.rooms) if (tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h) return r;
    return null;
  }

  // -------------------------------------------------------------------------
  // Player

  private updatePlayer(dt: number, intent: Intent) {
    const p = this.player;
    p.stateT += dt;
    p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.swapLock = Math.max(0, p.swapLock - dt);
    p.flash = Math.max(0, p.flash - dt);
    p.relicCd = Math.max(0, p.relicCd - dt);
    p.afterDodgeT = Math.max(0, p.afterDodgeT - dt);
    p.hasteT = Math.max(0, p.hasteT - dt);
    p.warcryT = Math.max(0, p.warcryT - dt);
    p.mirrorT = Math.max(0, p.mirrorT - dt);
    p.shieldT = Math.max(0, p.shieldT - dt);
    if (p.shieldT <= 0) p.shield = 0;
    for (const [k, v] of p.icd) if (v > 0) p.icd.set(k, v - dt);
    for (let i = 0; i < 2; i++) p.skillCd[i] = Math.max(0, p.skillCd[i] - dt);
    if (p.state === 'dead') return;

    const ws = weaponStats(p);
    let mx = intent.mx;
    let my = intent.my;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const wantsMove = ml > 0.15;
    let speedMul = 1;

    if (intent.swap && p.swapLock <= 0 && (p.state === 'free' || (p.state === 'attack' && p.atkPhase === 'recovery'))) {
      const other = (1 - p.weaponIndex) as 0 | 1;
      if (p.loadout.weapons[other]) {
        p.weaponIndex = other;
        p.swapLock = 0.25;
        p.state = 'free';
        p.atkStep = 0;
        refreshBuild(p);
        this.fx.sound('swap');
        this.fx.toast(`${p.loadout.weapons[other]!.name}`, 'info');
        this.trigger('swap', p.x, p.y, null, { effect: 'swap', chain: [] });
      }
    }

    const canDodge = p.dodgeCd <= 0 && (p.state === 'free' || (p.state === 'attack' && p.atkPhase !== 'active') || (p.state === 'skill' && p.stateT < 0.1));
    if (intent.dodge && canDodge) {
      let dx = mx;
      let dy = my;
      if (!wantsMove) {
        dx = Math.cos(p.face);
        dy = Math.sin(p.face);
      }
      const n = norm(dx, dy);
      p.dodgeDx = n.x;
      p.dodgeDy = n.y;
      p.state = 'dodge';
      p.stateT = 0;
      p.invuln = DODGE_IFRAMES;
      p.atkStep = 0;
      p.atkQueued = false;
      p.afterDodgeT = 1.5;
      this.fx.sound('dodge');
      this.fx.burst('dust', p.x, p.y + 3);
      if (p.build.rules.has('decoy'))
        this.allies.push({ id: this.nextId++, kind: 'decoy', x: p.x, y: p.y, t: 0, life: 1.6, el: 'none', power: p.build.rules.get('decoy')!, cd: 0, angle: 0, hits: new Map() });
      this.trigger('dodge', p.x, p.y, null, { effect: 'dodge', chain: [] });
    }

    if (intent.flask && p.state === 'free' && p.flasks > 0 && p.hp < p.build.maxHp) {
      p.state = 'flask';
      p.stateT = 0;
      p.flasks--;
    }

    if (intent.relic && p.relicCd <= 0 && p.loadout.relic && (p.state === 'free' || (p.state === 'attack' && p.atkPhase === 'recovery'))) {
      useRelic(this, intent);
    }

    if (intent.skill && ws && p.skillCd[p.weaponIndex] <= 0 && (p.state === 'free' || (p.state === 'attack' && p.atkPhase === 'recovery'))) {
      this.startSkill(ws, intent);
    }

    if ((intent.attack || (intent.attackHeld && p.state === 'free')) && ws) {
      if (p.state === 'free') this.startAttack(ws, intent, p.comboIdle > 0.45 ? 0 : p.atkStep);
      else if (p.state === 'attack') p.atkQueued = true;
    } else if (intent.attackHeld && p.state === 'attack' && p.atkPhase === 'recovery') p.atkQueued = true;

    switch (p.state) {
      case 'free':
        p.comboIdle += dt;
        break;
      case 'attack':
        speedMul = this.updateAttack(ws!, dt, intent);
        break;
      case 'dodge': {
        const t = p.stateT / DODGE_TIME;
        const v = (DODGE_DIST / DODGE_TIME) * 1.9 * (1 - t);
        this.moveBody(p, p.dodgeDx * v * dt, p.dodgeDy * v * dt, false);
        if (Math.random() < 0.3) this.fx.burst('dust', p.x, p.y + 3);
        if (p.stateT >= DODGE_TIME) {
          p.state = 'free';
          p.dodgeCd = DODGE_CD * p.build.dodgeCdMul;
        }
        speedMul = 0;
        break;
      }
      case 'skill':
        speedMul = this.updateSkill(ws!, dt);
        break;
      case 'flask': {
        speedMul = 0.45;
        if (p.stateT >= 0.6) {
          const heal = Math.round(p.build.maxHp * 0.3 * p.build.flaskMul);
          this.healPlayer(heal);
          p.poison.active = 0;
          p.poison.build = 0;
          p.burn.active = 0;
          p.chill.active = 0;
          this.fx.burst('heal', p.x, p.y - 6);
          this.fx.sound('heal');
          p.state = 'free';
          this.trigger('flask', p.x, p.y, null, { effect: 'flask', chain: [] });
        }
        break;
      }
    }

    if (p.state !== 'dodge') {
      const chill = p.chill.active > 0 ? 0.6 : 1;
      const haste = p.hasteT > 0 ? 1 + p.hastePct / 100 : 1;
      const sp = PLAYER_SPEED * p.build.moveMul * speedMul * chill * haste;
      const tx = wantsMove ? mx * sp : 0;
      const ty = wantsMove ? my * sp : 0;
      const k = damp(wantsMove ? 22 : 18, dt);
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
      this.moveBody(p, p.vx * dt, p.vy * dt, false);
      if (wantsMove && (p.state === 'free' || p.state === 'flask')) p.face = Math.atan2(my, mx);
    } else {
      p.vx = p.dodgeDx * 60;
      p.vy = p.dodgeDy * 60;
      p.face = Math.atan2(p.dodgeDy, p.dodgeDx);
    }
    p.moving = wantsMove && speedMul > 0.2;
    if (p.moving) p.walkT += dt * (0.6 + speedMul * 0.6);
    const a = p.state === 'attack' ? p.atkDir : p.state === 'skill' ? p.skillDir : p.face;
    p.dir4 = dir4(a);
  }

  healPlayer(n: number) {
    const p = this.player;
    if (n <= 0 || p.state === 'dead') return;
    const before = p.hp;
    p.hp = Math.min(p.build.maxHp, p.hp + n);
    const got = Math.round(p.hp - before);
    if (got > 0) this.fx.number(p.x, p.y - 20, `+${got}`, 'heal');
  }

  chooseAim(intent: Intent, reach: number): number {
    const p = this.player;
    if (intent.aim !== null) return intent.aim;
    const desired = Math.hypot(intent.mx, intent.my) > 0.2 ? Math.atan2(intent.my, intent.mx) : p.face;
    const cur = p.targetId !== null ? this.enemies.find((e) => e.id === p.targetId && e.state !== 'dead') : undefined;
    if (cur && p.atkStep > 0) {
      const d = Math.hypot(cur.x - p.x, cur.y - p.y);
      if (d < reach + cur.r + 26) return Math.atan2(cur.y - p.y, cur.x - p.x);
    }
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > reach + e.r + 30) continue;
      const ad = Math.abs(angleDiff(desired, Math.atan2(dy, dx)));
      if (ad > 1.25) continue;
      if (reach > 60 && !this.map.lineOfSight(p.x, p.y, e.x, e.y)) continue;
      const score = d + ad * 40;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    p.targetId = best ? best.id : null;
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : desired;
  }

  private startAttack(ws: WeaponStats, intent: Intent, step: number) {
    const p = this.player;
    const s = ws.combo[step % ws.combo.length];
    p.state = 'attack';
    p.stateT = 0;
    p.atkStep = step % ws.combo.length;
    p.atkPhase = 'windup';
    p.atkT = 0;
    p.atkQueued = false;
    p.atkFired = false;
    p.atkCount++;
    p.atkId = this.nextId++;
    p.atkDir = this.chooseAim(intent, s.shot ? 170 : s.reach * ws.reachMul);
    p.face = p.atkDir;
    p.echoPending = p.echoArmed;
    p.echoArmed = 0;
    if (p.build.rules.has('bloodPact') && p.hp > 2) p.hp -= 1;
  }

  attackSpec(ws: WeaponStats, s: AttackStep, finisher: boolean, mul = 1, kind: HitSpec['kind'] = 'attack'): HitSpec {
    const item = ws.item;
    return {
      dmg: ws.damage * s.mul * mul,
      el: item.element,
      el2: item.element2,
      build: item.buildup * Math.min(1.5, s.mul) * Math.min(1, mul),
      poise: s.poise,
      knock: s.heavy || ws.fam.heavy ? 110 : 55,
      dir: this.player.atkDir,
      heavy: !!s.heavy || ws.fam.heavy,
      kind,
      finisher,
      src: { effect: kind, chain: [] },
    };
  }

  private updateAttack(ws: WeaponStats, dt: number, intent: Intent): number {
    const p = this.player;
    const s = ws.combo[p.atkStep];
    p.atkT += dt * ws.speedMul;
    // Single-step (ranged) weapons treat every third shot as a combo finisher.
    const finisher = ws.combo.length > 1 ? p.atkStep === ws.combo.length - 1 : p.atkCount % 3 === 0;
    if (p.atkPhase === 'windup') {
      if (p.atkT >= s.windup) {
        p.atkPhase = 'active';
        p.atkT = 0;
        if (s.shot) {
          this.fireShot(ws, s, p.atkDir, finisher);
          this.fx.sound(ws.family === 'bow' ? 'bow' : 'magic');
        } else {
          this.fx.sound(s.heavy || ws.fam.heavy ? 'swingHeavy' : 'swing');
          if (p.build.rules.has('waveSwings')) this.spawnWave(ws, p.atkDir, p.build.rules.get('waveSwings')!);
        }
      }
      return ws.fam.heavy ? 0.15 : s.shot ? 0.5 : 0.3;
    }
    if (p.atkPhase === 'active') {
      if (!s.shot) {
        const lungeV = s.lunge / s.active;
        this.moveBody(p, Math.cos(p.atkDir) * lungeV * dt, Math.sin(p.atkDir) * lungeV * dt, false);
        this.resolveMelee(s.reach * ws.reachMul, s.arc, p.atkId, this.attackSpec(ws, s, finisher));
      }
      if (p.atkT >= s.active) {
        p.atkPhase = 'recovery';
        p.atkT = 0;
        const echo = Math.max(p.echoPending, p.mirrorT > 0 ? p.mirrorPct : 0);
        if (echo > 0) {
          p.echoPending = 0;
          echoSwing(this, ws, s, echo, finisher);
        }
        if (p.build.rules.has('twinStrike')) {
          const dir = p.atkDir;
          this.echoQueue.push({
            t: this.time + 0.09,
            fn: () => {
              if (s.shot) this.fireShot(ws, s, dir, false, 0.5, 'proc');
              else {
                const spec = this.attackSpec(ws, s, false, 0.5, 'proc');
                this.resolveMelee(s.reach * ws.reachMul, s.arc, this.nextId++, spec, p.x, p.y, dir);
                this.fx.burst('hit', p.x + Math.cos(dir) * 14, p.y - 4 + Math.sin(dir) * 14, dir, 0.6);
              }
            },
          });
        }
      }
      return s.shot ? 0.6 : 0.1;
    }
    if (p.atkQueued && p.atkT >= s.recovery * 0.35) {
      p.comboIdle = 0;
      this.startAttack(ws, intent, p.atkStep + 1);
      return 0.3;
    }
    if (p.atkT >= s.recovery) {
      p.state = 'free';
      p.comboIdle = 0;
      p.atkStep = (p.atkStep + 1) % ws.combo.length;
      if (p.atkStep === 0) p.comboIdle = 1;
    }
    return s.shot ? 0.75 : 0.45;
  }

  fireShot(ws: WeaponStats, s: AttackStep, dir: number, finisher: boolean, mul = 1, kind: HitSpec['kind'] = 'attack', countOverride?: number, spreadOverride?: number) {
    const p = this.player;
    const sh = s.shot!;
    const count = countOverride ?? sh.count + p.build.proj;
    const spread = spreadOverride ?? (count > 1 ? Math.max(sh.spread, 0.14) : 0);
    for (let i = 0; i < count; i++) {
      const a = dir + (count > 1 ? (i / (count - 1) - 0.5) * spread * (count - 1) : 0);
      const spec = this.attackSpec(ws, s, finisher, mul, kind);
      spec.dir = a;
      this.spawnPlayerProj(sh.proj, p.x + Math.cos(a) * 8, p.y - 6 + Math.sin(a) * 8, a, sh.speed, sh.life, sh.radius, spec, {
        pierce: sh.pierce,
        returns: sh.returns,
        homing: sh.homing,
        rehit: sh.rehit,
      });
    }
    this.fx.burst('muzzle', p.x + Math.cos(dir) * 10, p.y - 6 + Math.sin(dir) * 10, dir, 1, ws.item.element);
  }

  spawnPlayerProj(
    kind: ProjKind,
    x: number,
    y: number,
    a: number,
    speed: number,
    life: number,
    r: number,
    hit: HitSpec,
    o: { pierce?: number; returns?: boolean; homing?: number; rehit?: number } = {},
  ): Projectile {
    const pr: Projectile = {
      id: this.nextId++,
      owner: 'player',
      kind,
      x,
      y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r,
      life,
      maxLife: life,
      hit,
      damage: 0,
      buildup: null,
      pierce: o.pierce ?? 0,
      hits: new Map(),
      rehit: o.rehit ?? 0,
      returns: !!o.returns,
      returning: false,
      homing: o.homing ?? 0,
      el: hit.el,
      cause: '',
    };
    this.projectiles.push(pr);
    return pr;
  }

  private spawnWave(ws: WeaponStats, dir: number, mul: number) {
    const p = this.player;
    const spec = this.attackSpec(ws, ws.combo[p.atkStep], false, mul, 'proc');
    spec.dir = dir;
    this.spawnPlayerProj('wave', p.x + Math.cos(dir) * 10, p.y - 4 + Math.sin(dir) * 10, dir, 190, 0.5, 9, spec, { pierce: 99 });
  }

  /** Arc hit test from the player (or another origin). */
  resolveMelee(reach: number, arc: number, atkId: number, spec: HitSpec, ox = this.player.x, oy = this.player.y, dir = this.player.atkDir) {
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.lastHit === atkId) continue;
      const dx = e.x - ox;
      const dy = e.y - oy;
      const d = Math.hypot(dx, dy);
      if (d - e.r > reach) continue;
      if (arc < Math.PI * 1.99 && d > e.r + 4 && Math.abs(angleDiff(dir, Math.atan2(dy, dx))) > arc / 2) continue;
      if (!this.map.lineOfSight(ox, oy, e.x, e.y)) continue;
      e.lastHit = atkId;
      this.playerHit(e, { ...spec, dir: Math.atan2(dy, dx) });
    }
  }

  /** All player-sourced damage flows through here: conditions, crits, statuses, triggers. */
  playerHit(e: Enemy, h: HitSpec): void {
    if (e.state === 'dead') return;
    const p = this.player;
    const b = p.build;
    const ws = weaponStats(p);
    let mul = b.dmgMul;
    if (h.kind === 'skill') mul *= b.skillDmg;
    const nearCount = (r: number) => this.enemies.filter((o) => o.state !== 'dead' && Math.hypot(o.x - p.x, o.y - p.y) < r).length;
    for (const c of b.conds) {
      let on = false;
      switch (c.cond) {
        case 'vsPoison':
          on = e.poison.active > 0;
          break;
        case 'vsFrozen':
          on = e.frost.active > 0 || !!e.boss?.chill;
          break;
        case 'vsBurning':
          on = e.burn.active > 0;
          break;
        case 'vsShocked':
          on = e.shock.active > 0;
          break;
        case 'vsStatus':
          on = e.poison.active > 0 || e.frost.active > 0 || e.burn.active > 0 || e.shock.active > 0;
          break;
        case 'fullHp':
          on = p.hp >= b.maxHp;
          break;
        case 'lowHp':
          on = p.hp < b.maxHp * 0.4;
          break;
        case 'afterDodge':
          on = p.afterDodgeT > 0;
          break;
        case 'elite':
          on = e.elite || !!e.boss;
          break;
        case 'crowd':
          mul *= 1 + (c.value * Math.min(5, nearCount(60))) / 100;
          break;
        case 'firstStrike':
          on = e.hp >= e.maxHp;
          break;
        case 'alone':
          on = nearCount(90) <= 1;
          break;
      }
      if (on) mul *= 1 + c.value / 100;
    }
    if (b.rules.has('berserk')) mul *= 1 + Math.max(0, 1 - p.hp / b.maxHp);
    if (p.warcryT > 0) mul *= 1 + p.warcryPct / 100;
    const canCrit = h.kind === 'attack' || h.kind === 'skill';
    const crit = canCrit && this.rng.next() < b.crit + (ws?.crit ?? 0);
    if (crit) mul *= 1 + b.critBonus;
    const frozen = e.frost.active > 0 && !e.boss;
    if (e.boss && e.boss.stunned > 0) mul *= 1.6;
    if (e.def?.frontGuard && !h.heavy) {
      const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
      if (Math.abs(angleDiff(toPlayer, e.aim)) < 1.1 && e.state !== 'stagger') {
        mul *= e.def.frontGuard;
        if (Math.random() < 0.3) this.fx.number(e.x, e.y - e.r - 14, 'BLOCK', 'block');
      }
    }
    if (this.has(e, 'armored')) mul *= 0.65;
    let dmg = Math.max(1, Math.round(h.dmg * mul));
    const heavy = h.heavy;
    if (h.kind === 'attack' || h.kind === 'skill') {
      this.fx.burst(heavy ? 'heavyHit' : 'hit', e.x, e.y - 4, h.dir, heavy ? 1.3 : 1, h.el);
      this.fx.sound(crit ? 'crit' : heavy ? 'heavyHit' : 'hit');
      if (heavy) {
        this.fx.shake(2.5);
        this.fx.hitstop(0.07);
      } else this.fx.hitstop(crit ? 0.045 : 0.02);
    }
    if (e.ward > 0) {
      const absorbed = Math.min(e.ward, dmg);
      e.ward -= absorbed;
      dmg -= absorbed;
      this.fx.burst('ward', e.x, e.y - 6, 0, 0.6);
      if (e.ward <= 0) this.fx.number(e.x, e.y - e.r - 14, 'WARD BROKEN', 'block');
      if (dmg <= 0) return;
    }
    this.damageEnemy(e, dmg, h.src, { crit, poise: h.poise, knock: h.knock, dir: h.dir, kind: crit ? 'crit' : h.kind === 'proc' || h.kind === 'ally' ? 'proc' : 'hit' });
    if (b.lifeSteal > 0) {
      const heal = dmg * b.lifeSteal;
      if (heal >= 0.5) p.hp = Math.min(b.maxHp, p.hp + heal);
    }
    const atk = h.kind === 'attack' || h.kind === 'skill';
    if (atk) {
      this.combo++;
      this.comboT = 2.2;
      if (this.combo > this.bestCombo) this.bestCombo = this.combo;
      if (this.combo > 0 && this.combo % 25 === 0) {
        this.fx.callout(`${this.combo} HIT COMBO`, 1);
        this.fx.sound('combo');
      }
    }
    // Shocked foes conduct a share of each blow to a neighbour.
    if (e.shock.active > 0 && atk) {
      const n = this.nearestEnemy(e.x, e.y, 70, e);
      if (n) {
        this.fx.beam(e.x, e.y - 6, n.x, n.y - 6, 'shock', 'chain');
        this.damageEnemy(n, Math.max(1, Math.round(dmg * 0.3)), { effect: 'conduct', chain: ['conduct'] }, { kind: 'shock' });
      }
    }
    if (!isDead(e)) {
      const bm = 1 + b.build / 100;
      if (h.el !== 'none' && h.build > 0) this.applyStatus(e, h.el as StatusEl, h.build * bm * (1 + b.elBuild[h.el as StatusEl] / 100), h.src);
      if (h.el2 && h.el2 !== 'none' && h.build > 0) this.applyStatus(e, h.el2 as StatusEl, h.build * bm * (1 + b.elBuild[h.el2 as StatusEl] / 100), h.src);
      if (frozen && e.frost.active > 0 && (heavy || crit)) this.shatter(e, h.src);
    }
    if (atk) {
      p.hitCount++;
      this.trigger('hit', e.x, e.y, e, h.src);
      this.trigger('nth', e.x, e.y, e, h.src);
      if (crit) {
        this.trigger('crit', e.x, e.y, e, h.src);
        const storm = b.rules.get('stormborn');
        if (storm) doEffect(this, { k: 'proc', trig: 'crit', chance: 1, n: 0, effect: 'chain', el: 'shock', power: storm, count: 2, icd: 0 }, e.x, e.y, e, { effect: 'stormborn', chain: ['stormborn'] });
      }
      if (h.finisher) this.trigger('finisher', e.x, e.y, e, h.src);
    }
  }

  nearestEnemy(x: number, y: number, maxD: number, not?: Enemy | null, exclude?: Set<number>): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD;
    for (const o of this.enemies) {
      if (o === not || o.state === 'dead' || exclude?.has(o.id)) continue;
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  private startSkill(ws: WeaponStats, intent: Intent) {
    const p = this.player;
    const fam = ws.fam;
    p.state = 'skill';
    p.stateT = 0;
    p.skillId = fam.skill.id;
    p.skillHit = 0;
    p.skillDir = this.chooseAim(intent, fam.skill.id === 'leap' ? 90 : 120);
    p.face = p.skillDir;
    p.skillCd[p.weaponIndex] = fam.skill.cooldown * p.build.skillCdMul;
    p.atkId = this.nextId++;
    if (fam.skill.id === 'leap') {
      const t = p.targetId !== null ? this.enemies.find((e) => e.id === p.targetId) : null;
      const d = t ? Math.min(90, Math.hypot(t.x - p.x, t.y - p.y)) : 60;
      p.skillX = p.x + Math.cos(p.skillDir) * d;
      p.skillY = p.y + Math.sin(p.skillDir) * d;
    }
    this.fx.sound('skill');
    this.trigger('skill', p.x, p.y, null, { effect: 'skill', chain: [] });
  }

  private skillSpec(ws: WeaponStats, mul: number, heavy = false): HitSpec {
    const s = ws.combo[ws.combo.length - 1];
    const spec = this.attackSpec(ws, s, false, mul / s.mul, 'skill');
    spec.heavy = heavy || spec.heavy;
    spec.poise = heavy ? 120 : 40;
    return spec;
  }

  private updateSkill(ws: WeaponStats, dt: number): number {
    const p = this.player;
    const t = p.stateT;
    const dir = p.skillDir;
    const aoe = p.build.aoe;
    switch (p.skillId) {
      case 'crescent': {
        if (t >= 0.12 && !p.skillHit) {
          p.skillHit = 1;
          const spec = this.skillSpec(ws, 1.8);
          this.spawnPlayerProj('wave', p.x + Math.cos(dir) * 10, p.y - 4 + Math.sin(dir) * 10, dir, 180, 0.8, 11 * aoe, spec, { pierce: 99 });
          this.fx.sound('swing');
        }
        if (t >= 0.35) p.state = 'free';
        return 0.3;
      }
      case 'lunge': {
        p.invuln = Math.max(p.invuln, 0.05);
        if (t < 0.2) {
          this.moveBody(p, Math.cos(dir) * 360 * dt, Math.sin(dir) * 360 * dt, false);
          const id = t < 0.1 ? p.atkId : p.atkId + 0.5;
          this.resolveMelee(18 * aoe, Math.PI * 2, id, this.skillSpec(ws, 1.4), p.x, p.y, dir);
        }
        if (t >= 0.32) {
          p.state = 'free';
          p.atkStep = 0;
        }
        return 0;
      }
      case 'rush': {
        p.invuln = Math.max(p.invuln, 0.05);
        if (t < 0.26) {
          this.moveBody(p, Math.cos(dir) * 300 * dt, Math.sin(dir) * 300 * dt, false);
          this.resolveMelee(26 * aoe, 0.7, p.atkId, this.skillSpec(ws, 1.6), p.x, p.y, dir);
          if (Math.random() < 0.5) this.fx.burst('dust', p.x, p.y + 2);
        }
        if (t >= 0.42) p.state = 'free';
        return 0;
      }
      case 'reap': {
        const spins = Math.floor(t / 0.2);
        if (spins < 3 && spins >= p.skillHit) {
          p.skillHit = spins + 1;
          this.resolveMelee(40 * aoe, Math.PI * 2, p.atkId + spins * 0.1, this.skillSpec(ws, 1.1, spins === 2), p.x, p.y, dir);
          this.fx.burst('nova', p.x, p.y - 4, 0, 1.1 * aoe, ws.item.element);
          this.fx.sound('swing');
        }
        if (t >= 0.75) p.state = 'free';
        return 0.5;
      }
      case 'leap': {
        p.invuln = Math.max(p.invuln, t < 0.35 ? 0.05 : 0);
        if (t < 0.35) {
          const k = Math.min(1, dt / Math.max(0.01, 0.35 - t + dt));
          this.moveBody(p, (p.skillX - p.x) * k, (p.skillY - p.y) * k, false);
        } else if (!p.skillHit) {
          p.skillHit = 1;
          this.fx.burst('fracture', p.x, p.y, dir, 0.9 * aoe);
          this.fx.shake(5);
          this.fx.hitstop(0.08);
          this.fx.sound('heavyHit');
          this.resolveMelee(42 * aoe, Math.PI * 2, p.atkId, this.skillSpec(ws, 2.4, true), p.x, p.y, dir);
        }
        if (t >= 0.7) p.state = 'free';
        return 0;
      }
      case 'volley': {
        if (t >= 0.14 && !p.skillHit) {
          p.skillHit = 1;
          const s = ws.combo[0];
          this.fireShot(ws, s, dir, false, 0.9 / Math.max(0.5, s.mul), 'skill', 7 + p.build.proj, 0.13);
          this.fx.sound('bow');
        }
        if (t >= 0.4) p.state = 'free';
        return 0.4;
      }
      case 'burst': {
        if (t >= 0.16 && !p.skillHit) {
          p.skillHit = 1;
          const n = 10 + p.build.proj * 2;
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            const spec = this.skillSpec(ws, 0.9);
            spec.dir = a;
            this.spawnPlayerProj('bolt', p.x, p.y - 6, a, 170, 0.9, 3, spec, { homing: 1.5 });
          }
          this.fx.burst('nova', p.x, p.y - 6, 0, 1, ws.item.element);
          this.fx.sound('magic');
        }
        if (t >= 0.45) p.state = 'free';
        return 0.3;
      }
      case 'recall': {
        if (t >= 0.12 && !p.skillHit) {
          p.skillHit = 1;
          for (let i = -1; i <= 1; i++) {
            const a = dir + i * 0.55;
            const spec = this.skillSpec(ws, 1.1);
            spec.dir = a;
            this.spawnPlayerProj('chakram', p.x, p.y - 6, a, 230, 0.55, 6, spec, { pierce: 99, returns: true, rehit: 0.25 });
          }
          this.fx.sound('swing');
        }
        if (t >= 0.4) p.state = 'free';
        return 0.4;
      }
      default: {
        // fracture
        if (t >= 0.42 && !p.skillHit) {
          p.skillHit = 1;
          const cx = p.x + Math.cos(dir) * 12;
          const cy = p.y + Math.sin(dir) * 12;
          this.fx.burst('fracture', cx, cy, dir, aoe);
          this.fx.shake(5);
          this.fx.hitstop(0.09);
          this.fx.sound('heavyHit');
          for (const e of this.enemies) {
            if (e.state === 'dead') continue;
            if (Math.hypot(e.x - cx, e.y - cy) - e.r > 56 * aoe) continue;
            if (!this.map.lineOfSight(cx, cy, e.x, e.y)) continue;
            const spec = this.skillSpec(ws, 2, true);
            spec.dir = Math.atan2(e.y - cy, e.x - cx);
            this.playerHit(e, spec);
          }
        }
        if (t >= 0.9) p.state = 'free';
        return t < 0.42 ? 0.15 : 0.05;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Triggers (with recursion guard)

  child(src: Src, effect: string): Src | null {
    const deep = this.player.build.rules.has('chainReaction') ? 2 : 1;
    const repeats = src.chain.filter((e) => e === effect).length;
    if (src.chain.length >= 5 * deep || repeats >= 2 * deep) return null;
    return { effect, chain: [...src.chain, effect] };
  }

  trigger(t: Trigger, x: number, y: number, target: Enemy | null, src: Src, statusEl?: StatusEl): void {
    const p = this.player;
    for (const ap of p.build.procs) {
      const pr = ap.p;
      if (pr.trig !== t) continue;
      if (t === 'status' && pr.statusEl !== statusEl) continue;
      if (t === 'nth' && (pr.n <= 0 || p.hitCount % pr.n !== 0)) continue;
      if ((p.icd.get(ap.key) ?? 0) > 0) continue;
      if (pr.chance < 1 && this.rng.next() > pr.chance) continue;
      const c = this.child(src, ap.key);
      if (!c) continue;
      if (pr.icd > 0) p.icd.set(ap.key, pr.icd);
      doEffect(this, pr, x, y, target, c);
    }
  }

  private updatePulses(dt: number) {
    const p = this.player;
    const inCombat = this.enemies.some((e) => e.aggro && e.state !== 'dead' && Math.hypot(e.x - p.x, e.y - p.y) < 170);
    for (const ap of p.build.procs) {
      if (ap.p.trig !== 'pulse') continue;
      const t = (this.pulseT.get(ap.key) ?? ap.p.n) - (inCombat ? dt : 0);
      if (t <= 0 && inCombat && p.state !== 'dead') {
        this.pulseT.set(ap.key, ap.p.n);
        const tgt = this.nearestEnemy(p.x, p.y, 170);
        doEffect(this, ap.p, tgt?.x ?? p.x, tgt?.y ?? p.y, tgt, { effect: ap.key, chain: [ap.key] });
      } else this.pulseT.set(ap.key, Math.max(0, t));
    }
  }

  // -------------------------------------------------------------------------
  // Damage, statuses

  damageEnemy(e: Enemy, dmg: number, src: Src, opts: { crit?: boolean; poise?: number; knock?: number; dir?: number; kind?: NumKind } = {}): void {
    if (e.state === 'dead') return;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 0.12;
    e.squash = 1;
    e.lastHurtT = this.time;
    this.fx.number(e.x, e.y - e.r * 1.4 - 8, `${dmg}`, opts.kind ?? (opts.crit ? 'crit' : 'hit'));
    if (!e.aggro) this.alert(e);
    if (opts.knock && opts.dir !== undefined && !e.boss) {
      const k = opts.knock * (e.elite ? 0.5 : 1) * (this.has(e, 'giant') ? 0.5 : 1);
      e.kx += Math.cos(opts.dir) * k;
      e.ky += Math.sin(opts.dir) * k;
    }
    if (opts.poise && !e.boss) {
      e.poise -= opts.poise;
      if (e.poise <= 0 && e.frost.active <= 0) {
        e.poise = e.poiseMax;
        this.releaseToken(e);
        e.state = 'stagger';
        e.t = 0;
      }
    }
    if (e.hp <= 0) this.killEnemy(e, src);
  }

  killEnemy(e: Enemy, src: Src) {
    const p = this.player;
    const statuses = (['poison', 'frost', 'burn', 'shock'] as StatusEl[]).filter((k) => e[k].active > 0);
    e.hp = 0;
    e.state = 'dead';
    e.deadT = 0;
    this.releaseToken(e);
    this.killed.add(e.id);
    this.kills++;
    this.multiKill++;
    this.multiT = 0.7;
    this.cb.milestone('kill', 1);
    this.fx.death(e);
    this.fx.burst(e.boss ? 'bossDeath' : 'death', e.x, e.y - 4, 0, e.r / 7);
    this.fx.sound('death');
    if (e.boss) {
      this.onBossDefeated(e);
      return;
    }
    const def = e.def!;
    const gold = Math.round((def.gold[0] + Math.random() * (def.gold[1] - def.gold[0])) * (e.elite ? 3 : 1) * (1 + e.mutations.length * 0.5));
    this.dropGold(e.x, e.y, gold);
    if (Math.random() < (e.elite ? 0.5 : 0.06)) this.pickups.push({ id: this.nextId++, kind: 'orb', x: e.x, y: e.y, z: 2, vz: 50, vx: 0, vy: 10, amount: 12, t: 0 });
    if (p.build.lifeKill) this.healPlayer(p.build.lifeKill);
    if (this.has(e, 'volatile')) this.addHazard('blast', 'enemy', e.x, e.y, 30, 0.8, Math.round(24 * e.dmgMul), 0, 0.2, 'burn', 'a volatile blast');
    if (this.has(e, 'splitter') && !e.small) {
      for (const s of [-1, 1]) {
        const m = this.makeEnemy(this.nextId++, e.kind as EnemyKind, e.x + s * 8, e.y, e.room, false, true);
        m.aggro = true;
        m.state = 'chase';
        m.kx = s * 90;
        this.enemies.push(m);
        this.roomAlive.set(e.room, (this.roomAlive.get(e.room) ?? 0) + 1);
      }
      this.fx.burst('split', e.x, e.y - 4);
    }
    if (p.build.rules.has('statusSpread') && statuses.length) {
      const c = this.child(src, 'contagion');
      if (c)
        for (const o of this.enemies) {
          if (o === e || o.state === 'dead' || Math.hypot(o.x - e.x, o.y - e.y) > 60) continue;
          for (const st of statuses) this.applyStatus(o, st, 999, c);
          this.fx.beam(e.x, e.y - 6, o.x, o.y - 6, statuses[0], 'chain');
        }
    }
    this.trigger('kill', e.x, e.y, e, src);
    const left = (this.roomAlive.get(e.room) ?? 1) - 1;
    this.roomAlive.set(e.room, left);
    if (left <= 0 && e.room >= 0 && !this.enemies.some((o) => o.room === e.room && o.state !== 'dead')) {
      this.fx.burst('roomClear', p.x, p.y - 8);
      this.fx.callout('ROOM CLEARED', 1);
      this.cb.milestone('room', 1);
    }
  }

  applyStatus(e: Enemy, kind: StatusEl, amount: number, src: Src): void {
    if (e.state === 'dead') return;
    const s = e[kind];
    s.build += amount;
    s.idle = 0;
    const threshold = e.resistBase[kind] * s.resist;
    if (s.build < threshold) return;
    s.build = 0;
    const dur = this.player.build.statusDur;
    const wasActive = s.active > 0;
    if (kind === 'poison') {
      // Poison does not stack: reaching the threshold again only refreshes duration.
      s.active = 5 * dur;
      s.tick = 0.5;
      if (!wasActive) {
        this.fx.burst('spores', e.x, e.y - 4, 0, 0.6);
        this.fx.sound('poison', 0.7);
      }
    } else if (kind === 'burn') {
      s.active = 3 * dur;
      s.tick = 0.3;
      if (!wasActive) {
        this.fx.burst('ignite', e.x, e.y - 4);
        this.fx.sound('fire', 0.7);
      }
    } else if (kind === 'shock') {
      s.active = 2.5 * dur;
      s.tick = 0.6;
      s.resist *= 1.25;
      this.fx.burst('electrify', e.x, e.y - 6);
      this.fx.sound('zap', 0.8);
      if (!e.boss && (e.state === 'windup' || e.state === 'active')) {
        this.releaseToken(e);
        e.state = 'stagger';
        e.t = 0;
      }
    } else if (e.boss) {
      e.boss.chill = 4 * dur;
      s.resist *= 1.5;
      this.fx.burst('freeze', e.x, e.y - 6, 0, 2);
      this.fx.sound('freeze');
      this.fx.toast('The Warden is chilled — slowed!', 'synergy');
    } else {
      s.active = 2.2 * dur * (this.player.build.rules.has('everfrost') ? 2 : 1);
      s.resist *= 1.5;
      this.releaseToken(e);
      if (e.state === 'windup' || e.state === 'active') {
        e.state = 'recover';
        e.t = 0;
      }
      e.kx = e.ky = 0;
      this.fx.burst('freeze', e.x, e.y - 4, 0, 1);
      this.fx.sound('freeze');
    }
    this.trigger('status', e.x, e.y, e, src, kind);
  }

  shatter(e: Enemy, src: Src) {
    const p = this.player;
    e.frost.active = 0;
    const ws = weaponStats(p);
    const dmg = Math.round(e.maxHp * 0.28 + (ws ? ws.procBase * 1.2 : 10));
    this.fx.burst('shatter', e.x, e.y - 4, 0, 1.3);
    this.fx.sound('shatter');
    this.fx.hitstop(0.1);
    this.fx.shake(4);
    const c = this.child(src, 'shatter') ?? src;
    this.damageEnemy(e, dmg, c, { kind: 'shatter' });
    for (const o of this.enemies) {
      if (o === e || o.state === 'dead') continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) - o.r < 32) this.damageEnemy(o, Math.round(dmg * 0.3), c, { kind: 'shatter' });
    }
    if (p.build.rules.has('everfrost')) p.dodgeCd = 0;
    this.trigger('shatter', e.x, e.y, e, c);
  }

  private updateStatuses(e: Enemy, dt: number) {
    if (e.state === 'dead') {
      e.deadT += dt;
      return;
    }
    e.squash = Math.max(0, e.squash - dt * 6);
    const b = this.player.build;
    for (const kind of ['poison', 'frost', 'burn', 'shock'] as const) {
      const s = e[kind];
      s.idle += dt;
      if (s.idle > 1.6 && s.build > 0) s.build = Math.max(0, s.build - 28 * dt);
      if (s.active <= 0 && s.resist > 1) s.resist = Math.max(1, s.resist - 0.04 * dt);
    }
    const tick = (kind: 'poison' | 'burn', every: number, pct: number, numKind: NumKind, burst: BurstKind) => {
      const s = e[kind];
      if (s.active <= 0 || e.state === 'dead') return;
      s.active -= dt;
      s.tick -= dt;
      if (s.tick > 0) return;
      s.tick = every;
      const dmg = Math.max(2, Math.round((e.boss ? pct * 0.25 : pct) * e.maxHp * (1 + b.elDmg[kind] / 100)));
      this.fx.burst(burst, e.x, e.y - 6);
      this.damageEnemy(e, dmg, { effect: `${kind}Tick`, chain: [`${kind}Tick`] }, { kind: numKind });
    };
    tick('poison', 0.5, 0.04, 'poison', 'poisonTick');
    tick('burn', 0.3, 0.035, 'burn', 'burnTick');
    if (!isDead(e) && e.shock.active > 0) {
      e.shock.active -= dt;
      e.shock.tick -= dt;
      if (e.shock.tick <= 0) {
        e.shock.tick = 0.6;
        this.fx.burst('shockTick', e.x, e.y - 6);
      }
    }
    if (e.frost.active > 0) {
      e.frost.active -= dt;
      if (e.frost.active <= 0) this.fx.burst('dust', e.x, e.y);
    }
    if (!isDead(e) && this.has(e, 'regen') && this.time - e.lastHurtT > 2 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.04 * dt);
  }

  private alert(e: Enemy) {
    e.aggro = true;
    for (const o of this.enemies) if (o.room === e.room && o.room >= 0) o.aggro = true;
  }

  private releaseToken(e: Enemy) {
    if (e.token) {
      e.token = false;
      this.tokens = Math.max(0, this.tokens - 1);
    }
  }

  // -------------------------------------------------------------------------
  // Enemies

  /** Enemies chase decoys when one is nearby. */
  private targetOf(e: Enemy): { x: number; y: number } {
    const d = this.allies.find((a) => a.kind === 'decoy' && Math.hypot(a.x - e.x, a.y - e.y) < 160);
    return d ?? this.player;
  }

  private updateEnemy(e: Enemy, dt: number) {
    if (e.state === 'dead') return;
    const p = this.player;
    const def = e.def!;
    e.flash = Math.max(0, e.flash - dt);
    e.anim += dt;
    if (e.kx || e.ky) {
      this.moveBody(e, e.kx * dt, e.ky * dt, def.flying);
      const k = damp(10, dt);
      e.kx -= e.kx * k;
      e.ky -= e.ky * k;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
    }
    if (e.frost.active > 0) return;

    const tg = this.targetOf(e);
    const dx = tg.x - e.x;
    const dy = tg.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    if (!e.aggro && p.state !== 'dead') {
      const r = this.roomAt(p.x, p.y);
      if ((r && r.id === e.room) || (d < 120 * this.mods.aggroMul && this.map.lineOfSight(e.x, e.y, p.x, p.y))) this.alert(e);
    }
    const rage = this.has(e, 'berserk') && e.hp < e.maxHp * 0.5 ? 1.3 : 1;
    const wind = e.windMul / rage;
    e.cd -= dt * rage;
    e.t += dt;
    const atk = def.attack;
    if (def.healer && e.aggro) {
      e.healCd -= dt;
      if (e.healCd <= 0) {
        e.healCd = 4;
        const hurt = this.enemies.find((o) => o !== e && o.state !== 'dead' && !o.boss && o.hp < o.maxHp * 0.85 && Math.hypot(o.x - e.x, o.y - e.y) < 110);
        if (hurt) {
          const heal = Math.round(hurt.maxHp * 0.18);
          hurt.hp = Math.min(hurt.maxHp, hurt.hp + heal);
          this.fx.beam(e.x, e.y - 8, hurt.x, hurt.y - 6, 'none', 'heal');
          this.fx.number(hurt.x, hurt.y - hurt.r - 12, `+${heal}`, 'heal');
        }
      }
    }
    switch (e.state) {
      case 'idle':
        if (e.aggro) e.state = 'chase';
        break;
      case 'chase': {
        if (p.state === 'dead') break;
        if (dx !== 0) e.facing = dx > 0 ? 1 : -1;
        e.aim = Math.atan2(dy, dx);
        const ranged = atk.kind === 'shoot' || atk.kind === 'mortar';
        const los = d < 200 && this.map.lineOfSight(e.x, e.y, tg.x, tg.y);
        const inRange = d <= atk.range + p.r && (!ranged || los);
        const maxTokens = MAX_ATTACK_TOKENS + (this.plan.floor >= 3 ? 1 : 0);
        if (inRange && e.cd <= 0 && this.tokens < maxTokens) {
          e.state = 'windup';
          e.t = 0;
          e.token = true;
          this.tokens++;
          e.ax = atk.kind === 'mortar' ? tg.x : e.x + Math.cos(e.aim) * atk.offset;
          e.ay = atk.kind === 'mortar' ? tg.y : e.y + Math.sin(e.aim) * atk.offset;
          e.hitPlayer = false;
          this.fx.sound('enemyWarn', 0.5);
          if (atk.kind === 'mortar') this.addHazard('mortar', 'enemy', e.ax, e.ay, atk.size, atk.windup * wind + 0.7, Math.round(atk.damage * e.dmgMul), atk.buildup?.amount ?? 0, 0.15, 'poison', e.name);
          break;
        }
        let mvx = 0;
        let mvy = 0;
        if (def.keepDistance > 0 && los) {
          const want = d - def.keepDistance;
          if (Math.abs(want) > 12) {
            mvx = (dx / d) * Math.sign(want);
            mvy = (dy / d) * Math.sign(want);
          } else {
            mvx = (-dy / d) * Math.sin(e.anim * 0.9 + e.id);
            mvy = (dx / d) * Math.sin(e.anim * 0.9 + e.id);
          }
        } else if (los && d < 90) {
          if (d > atk.range * 0.7) {
            mvx = dx / d;
            mvy = dy / d;
          }
        } else {
          const dir = this.flowDir(e.x, e.y);
          mvx = dir.x;
          mvy = dir.y;
        }
        if (this.tokens >= maxTokens && !e.token && d < atk.range + 24 && def.keepDistance === 0) {
          // Circle while waiting for an attack slot: pressure without simultaneous hits.
          mvx = (-dy / d) * 0.6;
          mvy = (dx / d) * 0.6;
        }
        for (const o of this.enemies) {
          if (o === e || o.state === 'dead') continue;
          const ox = e.x - o.x;
          const oy = e.y - o.y;
          const od = Math.hypot(ox, oy);
          const min = e.r + o.r + 3;
          if (od > 0 && od < min) {
            mvx += (ox / od) * (min - od) * 0.25;
            mvy += (oy / od) * (min - od) * 0.25;
          }
        }
        if (d < e.r + p.r + 2 && p.state !== 'dodge') {
          mvx -= (dx / d) * 1.5;
          mvy -= (dy / d) * 1.5;
        }
        const sp = e.speed * rage;
        e.vx += (mvx * sp - e.vx) * damp(8, dt);
        e.vy += (mvy * sp - e.vy) * damp(8, dt);
        this.moveBody(e, e.vx * dt, e.vy * dt, def.flying);
        break;
      }
      case 'windup': {
        const w = atk.windup * wind;
        if ((atk.kind === 'shoot' && e.t < w * 0.5) || (atk.kind === 'lunge' && e.t < w * 0.4) || (atk.kind === 'charge' && e.t < w * 0.35)) e.aim = Math.atan2(dy, dx);
        e.facing = Math.cos(e.aim) >= 0 ? 1 : -1;
        if (e.t >= w) {
          e.state = 'active';
          e.t = 0;
          if (atk.kind === 'shoot') {
            const n = (atk.count ?? 1) + (e.elite ? 2 : 0);
            for (let i = 0; i < n; i++) {
              const a = e.aim + (n > 1 ? (i / (n - 1) - 0.5) * 0.5 : 0);
              this.projectiles.push(this.enemyProj(e, e.kind === 'wisp' ? 'firebolt' : 'seed', a, atk.size, Math.round(atk.damage * e.dmgMul), atk.buildup ?? null));
            }
            this.fx.sound('shoot', 0.6);
          } else if (atk.kind === 'mortar') {
            const m = this.enemyProj(e, 'mortar', 0, 0, 0, null);
            m.life = m.maxLife = 0.7;
            m.tx = e.ax;
            m.ty = e.ay;
            m.sx = e.x;
            m.sy = e.y - 8;
            this.projectiles.push(m);
            this.fx.sound('shoot', 0.5);
          }
        }
        break;
      }
      case 'active': {
        const dmg = Math.round(atk.damage * e.dmgMul * rage);
        if (atk.kind === 'slam') {
          if (!e.hitPlayer && Math.hypot(p.x - e.ax, p.y - e.ay) < atk.size * e.scale + p.r) {
            e.hitPlayer = true;
            this.hurtPlayer(dmg, e.name, e.aim, e);
          }
          if (e.t < dt * 1.5) {
            this.fx.burst('leaves', e.ax, e.ay, e.aim, e.scale);
            this.fx.shake(1);
          }
        } else if (atk.kind === 'lunge' || atk.kind === 'charge') {
          const moved = this.moveBody(e, Math.cos(e.aim) * atk.size * dt, Math.sin(e.aim) * atk.size * dt, false);
          if (atk.kind === 'charge' && Math.random() < 0.5) this.fx.burst('dust', e.x, e.y + 4);
          if (!e.hitPlayer && Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r + 2) {
            e.hitPlayer = true;
            this.hurtPlayer(dmg, e.name, e.aim, e);
          }
          if (!moved && atk.kind === 'charge') {
            this.releaseToken(e);
            e.state = 'stagger';
            e.t = -0.5;
            this.fx.shake(2);
            this.fx.burst('fracture', e.x + Math.cos(e.aim) * 8, e.y + Math.sin(e.aim) * 8, e.aim, 0.4);
            break;
          }
        } else if (atk.kind === 'thrust') {
          if (!e.hitPlayer) {
            const lx = p.x - e.x;
            const ly = p.y - e.y;
            const along = lx * Math.cos(e.aim) + ly * Math.sin(e.aim);
            const across = Math.abs(-lx * Math.sin(e.aim) + ly * Math.cos(e.aim));
            if (along > 0 && along < atk.size && across < 7 + p.r) {
              e.hitPlayer = true;
              this.hurtPlayer(dmg, e.name, e.aim, e);
            }
          }
        }
        if (e.t >= atk.active) {
          e.state = 'recover';
          e.t = 0;
          this.releaseToken(e);
        }
        break;
      }
      case 'recover':
        if (e.t >= atk.recovery * wind) {
          e.state = 'chase';
          e.t = 0;
          e.cd = atk.cooldown * wind * (0.75 + Math.random() * 0.5);
        }
        break;
      case 'stagger':
        if (e.t >= 0.4) {
          e.state = 'chase';
          e.t = 0;
          e.cd = Math.max(e.cd, 0.3);
        }
        break;
    }
  }

  private enemyProj(e: Enemy, kind: ProjKind, a: number, speed: number, damage: number, buildup: Projectile['buildup']): Projectile {
    return {
      id: this.nextId++,
      owner: 'enemy',
      kind,
      x: e.x + Math.cos(a) * 8,
      y: e.y - 6 + Math.sin(a) * 8,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      r: 3,
      life: 2,
      maxLife: 2,
      hit: null,
      damage,
      buildup,
      pierce: 0,
      hits: new Map(),
      rehit: 0,
      returns: false,
      returning: false,
      homing: 0,
      el: kind === 'firebolt' ? 'burn' : 'poison',
      cause: e.name,
    };
  }

  hurtPlayer(dmg: number, cause: string, dir: number, attacker: Enemy | null): void {
    const p = this.player;
    if (p.state === 'dead' || p.invuln > 0 || p.hurtT > 0) return;
    const b = p.build;
    let reduced = Math.max(1, Math.round(dmg * (100 / (100 + b.defense * 6)) * (1 - b.guard / 100)));
    if (p.shield > 0) {
      const a = Math.min(p.shield, reduced);
      p.shield -= a;
      reduced -= a;
      this.fx.burst('shield', p.x, p.y - 8);
      this.fx.number(p.x, p.y - 22, `${Math.round(a)}`, 'shield');
      this.fx.sound('shield');
    }
    p.hurtT = HURT_PROTECT;
    p.causeOfDeath = cause;
    this.combo = 0;
    if (reduced > 0) {
      p.hp -= reduced;
      p.flash = 0.2;
      p.vx += Math.cos(dir) * 90;
      p.vy += Math.sin(dir) * 90;
      this.fx.number(p.x, p.y - 20, `${reduced}`, 'hurt');
      this.fx.sound('hurt');
      this.fx.shake(3);
      this.fx.hitstop(0.05);
    }
    if (attacker && attacker.state !== 'dead') {
      if (this.has(attacker, 'vampiric')) {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + dmg);
        this.fx.number(attacker.x, attacker.y - attacker.r - 12, `+${dmg}`, 'heal');
      }
      if (this.has(attacker, 'venomous')) this.applyPlayerStatus('poison', 45);
      if (this.has(attacker, 'frostbound')) this.applyPlayerStatus('chill', 60);
      if (this.has(attacker, 'blazing')) this.applyPlayerStatus('burn', 50);
    }
    this.trigger('hurt', p.x, p.y, attacker, { effect: 'hurt', chain: [] });
  }

  private updatePlayerStatus(dt: number) {
    const p = this.player;
    for (const kind of ['poison', 'burn', 'chill'] as const) {
      const s = p[kind];
      s.idle += dt;
      if (s.idle > 1.5 && s.build > 0) s.build = Math.max(0, s.build - 30 * dt);
      if (s.active <= 0) continue;
      s.active -= dt;
      if (kind === 'chill') continue;
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = kind === 'poison' ? 0.7 : 0.4;
        p.hp -= 3;
        p.causeOfDeath = kind === 'poison' ? 'Poison' : 'Flames';
        this.fx.number(p.x, p.y - 20, '3', kind === 'poison' ? 'poison' : 'burn');
        this.fx.burst(kind === 'poison' ? 'poisonTick' : 'burnTick', p.x, p.y - 8);
      }
    }
  }

  applyPlayerStatus(kind: 'poison' | 'burn' | 'chill', amount: number) {
    const p = this.player;
    if (p.invuln > 0) return;
    const s = p[kind];
    s.build += amount;
    s.idle = 0;
    if (s.build >= 100) {
      s.build = 0;
      if (s.active <= 0) this.fx.toast(kind === 'poison' ? 'Poisoned! Drink a flask to cleanse.' : kind === 'burn' ? 'You are burning!' : 'Chilled — you are slowed!', 'warn');
      s.active = kind === 'poison' ? 4.5 : 2.5;
      s.tick = 0.4;
    }
  }

  // -------------------------------------------------------------------------
  // Boss: The Thorn Warden

  private updateBossTrigger() {
    const b = this.boss;
    if (!b || this.bossFight !== 'none') return;
    const r = this.rooms[b.room];
    const p = this.player;
    const tx = p.x / TILE;
    const ty = p.y / TILE;
    if (tx > r.x + 1.5 && tx < r.x + r.w - 1.5 && ty > r.y + 1.5 && ty < r.y + r.h - 1) {
      this.bossFight = 'active';
      b.aggro = true;
      b.state = 'idle';
      b.t = 0;
      for (let y = r.y - 1; y <= r.y + r.h; y++)
        for (let x = r.x - 1; x <= r.x + r.w; x++) {
          const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
          if (!inside && this.map.get(x, y) === T.Floor) {
            this.map.set(x, y, T.Wall);
            this.gates.push({ x, y });
          }
        }
      this.fx.sound('gate');
      this.fx.shake(3);
      this.fx.callout('THE THORN WARDEN', 3);
    }
  }

  private updateBoss(e: Enemy, dt: number) {
    if (e.state === 'dead') return;
    const b = e.boss!;
    const p = this.player;
    e.flash = Math.max(0, e.flash - dt);
    e.anim += dt;
    if (this.bossFight !== 'active') return;
    const chillMul = b.chill > 0 ? 1.35 : 1;
    b.chill = Math.max(0, b.chill - dt);
    e.t += dt;
    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (!b.awake) {
      if (e.t > 1.4) {
        b.awake = true;
        e.state = 'chase';
        e.t = 0;
        this.fx.sound('bossRoar');
        this.fx.burst('roar', e.x, e.y - 10);
        this.fx.shake(4);
      }
      return;
    }
    if (b.stunned > 0) {
      b.stunned -= dt;
      if (b.stunned <= 0) {
        e.state = 'chase';
        e.t = 0;
      }
      return;
    }
    if (b.phase === 1 && e.hp < e.maxHp * 0.5) {
      b.phase = 2;
      b.move = 'roar';
      e.state = 'windup';
      e.t = 0;
      b.marks = [];
      this.fx.callout('THE WARDEN ENRAGES', 2);
      this.fx.sound('bossRoar');
      this.fx.burst('roar', e.x, e.y - 10);
      this.fx.shake(5);
      return;
    }
    const p2 = b.phase === 2;
    switch (e.state) {
      case 'chase': {
        if (dx) e.facing = dx > 0 ? 1 : -1;
        const sp = (e.speed * (p2 ? 1.3 : 1)) / chillMul;
        if (d > 40) this.moveBody(e, (dx / d) * sp * dt, (dy / d) * sp * dt, false);
        if (e.t > (p2 ? 0.45 : 0.8) * chillMul) {
          const choices: BossMove[] = d < 64 ? ['sweep', 'sweep', 'erupt'] : ['charge', 'erupt', 'charge'];
          let move = choices[Math.floor(this.rng.next() * choices.length)];
          if (b.last.length >= 2 && b.last[0] === move && b.last[1] === move) move = move === 'erupt' ? 'sweep' : 'erupt';
          this.startBossMove(e, move);
        }
        break;
      }
      case 'windup': {
        const wind = this.bossWindup(b.move!, p2, b.followUp) * chillMul;
        if (b.move === 'charge' && e.t < wind * 0.45) {
          e.aim = Math.atan2(dy, dx);
          b.chargeLen = this.rayLength(e.x, e.y, e.aim, 300);
        }
        if (b.move === 'sweep' && e.t < wind * 0.3) e.aim = Math.atan2(dy, dx);
        e.facing = Math.cos(e.aim) >= 0 ? 1 : -1;
        if (e.t >= wind) {
          e.state = 'active';
          e.t = 0;
          e.hitPlayer = false;
          b.chargeDist = 0;
          if (b.move === 'erupt') {
            this.fx.sound('erupt');
            for (const m of b.marks) this.addHazard('eruption', 'enemy', m.x, m.y, 15, 0, p2 ? 30 : 26, 0, 0.3, 'none', BOSS.name);
            b.marks = [];
            if (p2 && b.summons < 6 && this.enemies.filter((o) => !o.boss && o.state !== 'dead').length < 3) this.bossSummon(e);
          } else if (b.move === 'sweep') {
            this.fx.sound('swingHeavy');
            this.fx.burst('leaves', e.x + Math.cos(e.aim) * 30, e.y + Math.sin(e.aim) * 30, e.aim, 2);
          } else if (b.move === 'roar') this.fx.burst('roar', e.x, e.y - 10);
        }
        break;
      }
      case 'active': {
        if (b.move === 'sweep') {
          if (!e.hitPlayer && d < 54 + p.r && Math.abs(angleDiff(e.aim, Math.atan2(dy, dx))) < (210 * Math.PI) / 360) {
            e.hitPlayer = true;
            this.hurtPlayer(p2 ? 34 : 30, BOSS.name, e.aim, e);
          }
          if (e.t > 0.15) this.endBossMove(e);
        } else if (b.move === 'charge') {
          const v = p2 ? 300 : 255;
          const step = v * dt;
          const moved = this.moveBody(e, Math.cos(e.aim) * step, Math.sin(e.aim) * step, false);
          b.chargeDist += step;
          if (Math.random() < 0.6) this.fx.burst('dust', e.x, e.y + 8);
          if (!e.hitPlayer && d < e.r + p.r + 3) {
            e.hitPlayer = true;
            this.hurtPlayer(36, BOSS.name, e.aim, e);
          }
          if (!moved) {
            b.stunned = 2.2;
            e.state = 'stagger';
            this.fx.shake(6);
            this.fx.sound('heavyHit');
            this.fx.burst('fracture', e.x + Math.cos(e.aim) * 14, e.y + Math.sin(e.aim) * 14, e.aim, 1);
            this.fx.toast('Its core is exposed — strike now!', 'synergy');
            e.t = 0;
          } else if (b.chargeDist >= b.chargeLen + 30 || e.t > 1.6) this.endBossMove(e);
        } else if (b.move === 'erupt') {
          if (e.t > 0.35) this.endBossMove(e);
        } else if (b.move === 'roar') {
          if (e.t > 0.5) this.endBossMove(e);
        }
        break;
      }
      case 'recover':
        if (e.t > (p2 ? 0.45 : 0.65) * chillMul) {
          if (b.followUp) {
            b.followUp = false;
            this.startBossMove(e, 'sweep', true);
          } else {
            e.state = 'chase';
            e.t = 0;
          }
        }
        break;
    }
  }

  private bossSummon(e: Enemy) {
    const b = e.boss!;
    for (const s of [-1, 1]) {
      const a = this.rng.next() * Math.PI * 2;
      const x = e.x + Math.cos(a) * 40 * s;
      const y = e.y + Math.sin(a) * 30;
      if (this.map.solidAt(x, y)) continue;
      const m = this.makeEnemy(this.nextId++, this.rng.pick(['root', 'thornling'] as EnemyKind[]), x, y, e.room, false);
      m.aggro = true;
      m.state = 'chase';
      this.enemies.push(m);
      b.summons++;
      this.fx.burst('summon', x, y - 6, 0, 1, 'poison');
    }
  }

  private bossWindup(m: BossMove, p2: boolean, follow: boolean): number {
    if (m === 'sweep') return follow ? 0.45 : p2 ? 0.62 : 0.75;
    if (m === 'charge') return p2 ? 0.7 : 0.85;
    if (m === 'erupt') return p2 ? 0.85 : 1;
    return 1.2;
  }

  private startBossMove(e: Enemy, move: BossMove, followed = false) {
    const b = e.boss!;
    const p = this.player;
    b.move = move;
    b.last = [move, ...b.last].slice(0, 2);
    e.state = 'windup';
    e.t = 0;
    if (!followed) e.aim = Math.atan2(p.y - e.y, p.x - e.x);
    this.fx.sound('enemyWarn');
    if (move === 'erupt') {
      const n = b.phase === 2 ? 7 : 4;
      b.marks = [{ x: p.x, y: p.y }];
      for (let i = 1; i < n; i++) {
        const a = this.rng.next() * Math.PI * 2;
        const r = 24 + this.rng.next() * 46;
        const mx = p.x + Math.cos(a) * r;
        const my = p.y + Math.sin(a) * r;
        if (!this.map.solidAt(mx, my)) b.marks.push({ x: mx, y: my });
      }
    }
    if (move === 'charge') b.chargeLen = this.rayLength(e.x, e.y, e.aim, 300);
    if (move === 'sweep' && b.phase === 2 && !followed) b.followUp = true;
  }

  private endBossMove(e: Enemy) {
    e.state = 'recover';
    e.t = 0;
  }

  private onBossDefeated(e: Enemy) {
    this.bossFight = 'done';
    this.stairsOpen = true;
    this.hazards = [];
    for (const o of this.enemies) if (o !== e && o.state !== 'dead') this.killEnemy(o, { effect: 'bossDeath', chain: ['bossDeath'] });
    for (const g of this.gates) this.map.set(g.x, g.y, T.Floor);
    this.gates = [];
    this.fx.shake(8);
    this.fx.hitstop(0.25);
    this.fx.sound('bossRoar');
    this.fx.callout('WARDEN FELLED', 3);
    this.cb.milestone('boss', 1);
    this.dropGold(e.x, e.y, 80);
    this.cb.bossDefeated();
  }

  rayLength(x: number, y: number, a: number, max: number): number {
    for (let d = 0; d < max; d += 4) if (this.map.solidAt(x + Math.cos(a) * d, y + Math.sin(a) * d)) return Math.max(0, d - 8);
    return max;
  }

  addHazard(kind: HazardKind, owner: 'player' | 'enemy', x: number, y: number, r: number, warn: number, damage: number, buildup: number, active = 0.3, el: Element = 'none', cause = '', src: Src = { effect: kind, chain: [] }): Hazard {
    const h: Hazard = { kind, owner, x, y, r, warn, warnTotal: Math.max(warn, 0.001), active, activeTotal: Math.max(active, 0.001), damage, buildup, el, tick: 0, done: false, src, cause };
    this.hazards.push(h);
    return h;
  }

  // -------------------------------------------------------------------------
  // Projectiles, hazards, pickups

  private updateProjectiles(dt: number, edt: number) {
    const p = this.player;
    for (const pr of this.projectiles) {
      const pdt = pr.owner === 'enemy' ? edt : dt;
      pr.life -= pdt;
      if (pr.kind === 'mortar') {
        const t = 1 - Math.max(0, pr.life) / pr.maxLife;
        pr.x = pr.sx! + (pr.tx! - pr.sx!) * t;
        pr.y = pr.sy! + (pr.ty! - pr.sy!) * t - Math.sin(t * Math.PI) * 50;
        continue;
      }
      if (pr.homing > 0 && pr.owner === 'player') {
        const t = this.nearestEnemy(pr.x, pr.y, 120);
        if (t) {
          const want = Math.atan2(t.y - 4 - pr.y, t.x - pr.x);
          const cur = Math.atan2(pr.vy, pr.vx);
          const sp = Math.hypot(pr.vx, pr.vy);
          const na = cur + Math.max(-pr.homing * pdt, Math.min(pr.homing * pdt, angleDiff(cur, want)));
          pr.vx = Math.cos(na) * sp;
          pr.vy = Math.sin(na) * sp;
        }
      }
      if (pr.returns && !pr.returning && pr.life <= 0) {
        pr.returning = true;
        pr.life = 1.5;
        pr.hits.clear();
      }
      if (pr.returning) {
        const sp = Math.hypot(pr.vx, pr.vy) || 200;
        const a = Math.atan2(p.y - 6 - pr.y, p.x - pr.x);
        pr.vx += (Math.cos(a) * sp * 1.1 - pr.vx) * Math.min(1, 8 * pdt);
        pr.vy += (Math.sin(a) * sp * 1.1 - pr.vy) * Math.min(1, 8 * pdt);
        if (Math.hypot(p.x - pr.x, p.y - 6 - pr.y) < 10) pr.life = 0;
      }
      pr.x += pr.vx * pdt;
      pr.y += pr.vy * pdt;
      if (!pr.returning && this.map.blocksProjectile(pr.x, pr.y + (pr.owner === 'enemy' ? 6 : 4))) {
        if (pr.returns) {
          pr.returning = true;
          pr.life = 1.5;
          pr.hits.clear();
        } else {
          pr.life = 0;
          this.fx.burst(pr.owner === 'enemy' ? 'spores' : 'hit', pr.x, pr.y, 0, 0.5, pr.el);
          continue;
        }
      }
      if (pr.owner === 'enemy') {
        if (Math.hypot(p.x - pr.x, p.y - 6 - pr.y) < pr.r + p.r + 1 && p.invuln <= 0 && p.hurtT <= 0 && p.state !== 'dead') {
          this.hurtPlayer(pr.damage, pr.cause, Math.atan2(pr.vy, pr.vx), null);
          if (pr.buildup) this.applyPlayerStatus(pr.buildup.kind === 'frost' ? 'chill' : pr.buildup.kind, pr.buildup.amount);
          this.fx.burst(pr.kind === 'firebolt' ? 'ignite' : 'spores', pr.x, pr.y, 0, 0.6);
          pr.life = 0;
        }
        for (const a of this.allies) if (a.kind === 'decoy' && Math.hypot(a.x - pr.x, a.y - 6 - pr.y) < 8) pr.life = 0;
      } else if (pr.hit) {
        for (const e of this.enemies) {
          if (e.state === 'dead') continue;
          const last = pr.hits.get(e.id);
          if (last !== undefined && (pr.rehit <= 0 || this.time - last < pr.rehit)) continue;
          if (Math.hypot(e.x - pr.x, e.y - 4 - pr.y) < pr.r + e.r) {
            pr.hits.set(e.id, this.time);
            this.playerHit(e, { ...pr.hit, dir: Math.atan2(pr.vy, pr.vx) });
            if (pr.pierce <= 0 && !pr.returns) {
              pr.life = 0;
              break;
            }
            if (pr.rehit <= 0) pr.pierce--;
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);
  }

  private updateHazards(dt: number) {
    const p = this.player;
    for (const h of this.hazards) {
      if (h.warn > 0) {
        h.warn -= dt;
        if (h.warn <= 0) {
          if (h.kind === 'eruption') {
            this.fx.burst('erupt', h.x, h.y, 0, h.r / 14);
            this.fx.shake(1.5);
          } else if (h.kind === 'meteor') {
            this.fx.burst('meteor', h.x, h.y, 0, h.r / 30, h.el);
            this.fx.shake(4);
            this.fx.sound('boom');
          } else if (h.kind === 'strike') {
            this.fx.beam(h.x, h.y - 120, h.x, h.y, h.el, 'chain');
            this.fx.burst('electrify', h.x, h.y, 0, 1);
            this.fx.sound('zap');
          } else if (h.kind === 'blast' || h.kind === 'mortar') {
            this.fx.burst('explosion', h.x, h.y, 0, h.r / 24, h.el);
            this.fx.sound('boom', 0.7);
            if (h.kind === 'mortar') this.addHazard('puddle', 'enemy', h.x, h.y, h.r, 0, 0, h.buildup * 0.5, 3, 'poison', h.cause);
          }
        }
        continue;
      }
      h.active -= dt;
      if (h.owner === 'enemy') {
        if (h.kind === 'puddle') {
          h.tick -= dt;
          if (h.tick <= 0 && Math.hypot(p.x - h.x, p.y - h.y) < h.r + p.r) {
            h.tick = 0.5;
            this.applyPlayerStatus('poison', h.buildup);
          }
          continue;
        }
        if (!h.done && Math.hypot(p.x - h.x, p.y - h.y) < h.r + p.r) {
          h.done = true;
          if (h.damage) this.hurtPlayer(h.damage, h.cause || 'a hazard', Math.atan2(p.y - h.y, p.x - h.x), null);
          if (h.buildup) this.applyPlayerStatus('poison', h.buildup);
        }
        continue;
      }
      if (h.kind === 'vortex' || h.kind === 'cloud') {
        h.tick -= dt;
        for (const e of this.enemies) {
          if (e.state === 'dead' || e.boss) continue;
          const d = Math.hypot(e.x - h.x, e.y - h.y);
          if (d > h.r * 1.5) continue;
          if (h.kind === 'vortex' && d > 4) {
            e.kx += ((h.x - e.x) / d) * 260 * dt;
            e.ky += ((h.y - e.y) / d) * 260 * dt;
          }
        }
        if (h.tick <= 0) {
          h.tick = 0.45;
          for (const e of this.enemies) {
            if (e.state === 'dead' || Math.hypot(e.x - h.x, e.y - h.y) > h.r + e.r) continue;
            this.playerHit(e, { dmg: h.damage, el: h.el, build: h.buildup, poise: 5, knock: 0, dir: 0, heavy: false, kind: 'proc', src: h.src });
          }
        }
        continue;
      }
      if (!h.done) {
        h.done = true;
        for (const e of this.enemies) {
          if (e.state === 'dead' || Math.hypot(e.x - h.x, e.y - h.y) > h.r + e.r) continue;
          this.playerHit(e, { dmg: h.damage, el: h.el, build: h.buildup, poise: 50, knock: 80, dir: Math.atan2(e.y - h.y, e.x - h.x), heavy: h.kind === 'meteor', kind: 'proc', src: h.src });
        }
      }
    }
    this.hazards = this.hazards.filter((h) => h.warn > 0 || h.active > 0);
  }

  private updatePickups(dt: number) {
    const p = this.player;
    for (const k of this.pickups) {
      k.t += dt;
      if (k.z > 0 || k.vz > 0) {
        k.vz -= 260 * dt;
        k.z += k.vz * dt;
        if (k.z <= 0) {
          k.z = 0;
          k.vz = Math.abs(k.vz) > 30 ? -k.vz * 0.35 : 0;
        }
        const nx = k.x + k.vx * dt;
        const ny = k.y + k.vy * dt;
        if (!this.map.solidAt(nx, ny)) {
          k.x = nx;
          k.y = ny;
        }
        k.vx *= 1 - damp(3, dt);
        k.vy *= 1 - damp(3, dt);
      }
      if (k.kind === 'item' || p.state === 'dead') continue;
      const d = Math.hypot(p.x - k.x, p.y - k.y);
      if (k.t > 0.4 && d < 44) {
        const pull = 280 * dt;
        k.x += ((p.x - k.x) / d) * Math.min(pull, d);
        k.y += ((p.y - k.y) / d) * Math.min(pull, d);
      }
      if (k.t > 0.4 && d < 7) {
        if (k.kind === 'gold') {
          p.gold += k.amount;
          this.fx.sound('gold', 0.5);
        } else {
          this.healPlayer(k.amount);
          this.fx.sound('heal', 0.6);
        }
        k.t = -999;
      }
    }
    this.pickups = this.pickups.filter((k) => k.t > -100);
  }

  stairsCenter(): { x: number; y: number } {
    return { x: (this.plan.exit.x + 1) * TILE, y: (this.plan.exit.y + 1) * TILE };
  }

  private updateInteract(dt: number, intent: Intent) {
    const p = this.player;
    this.nearby = null;
    if (p.state === 'dead') return;
    let best: Interactable | null = null;
    let bestD = 22;
    for (const c of this.chests) {
      if (c.opened) continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'chest', chest: c };
      }
    }
    for (const k of this.pickups) {
      if (k.kind !== 'item' || k.t < 0.5) continue;
      const d = Math.hypot(k.x - p.x, k.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'item', pickup: k };
      }
    }
    for (const s of this.features) {
      if (s.used && s.kind !== 'merchant') continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD + 4) {
        bestD = d;
        best = { kind: 'feature', feature: s };
      }
    }
    if (this.stairsOpen) {
      const sc = this.stairsCenter();
      const d = Math.hypot(sc.x - p.x, sc.y - p.y);
      if (d < 26 && d < bestD + 6) best = { kind: 'stairs' };
    }
    this.nearby = best;

    if (best?.kind === 'stairs') {
      if (intent.interactHeld) {
        this.descendHold += dt;
        if (this.descendHold >= 0.7) {
          this.descendHold = 0;
          this.fx.sound('stairs');
          this.cb.descend();
        }
      } else this.descendHold = Math.max(0, this.descendHold - dt * 2);
      return;
    }
    this.descendHold = 0;
    if (!intent.interact || !best || p.state !== 'free') return;
    if (best.kind === 'chest') {
      const c = best.chest;
      c.opened = true;
      c.t = 0;
      this.fx.sound('chest');
      this.fx.burst('chest', c.x, c.y - 6);
      const item = this.cb.rollChestLoot(c);
      const drop = this.dropItem(item, c.x, c.y + 4);
      drop.vy = 34;
      drop.vx = (p.x < c.x ? 1 : -1) * 22;
      this.dropGold(c.x, c.y, 8 + this.plan.floor * 4 + (c.guarded ? 14 : 0));
    } else if (best.kind === 'item') this.cb.inspect(best.pickup);
    else if (best.kind === 'feature') {
      const s = best.feature;
      if (s.kind === 'spring') {
        s.used = true;
        this.healPlayer(Math.round(p.build.maxHp * 0.35));
        p.flasks = Math.min(p.maxFlasks, p.flasks + 1);
        p.poison.active = 0;
        p.burn.active = 0;
        this.fx.burst('heal', s.x, s.y - 4, 0, 1.5);
        this.fx.sound('heal');
        this.fx.toast('The moss spring restores you (+1 flask).', 'info');
      } else this.cb.feature(s);
    }
  }

  removePickup(p: Pickup) {
    this.pickups = this.pickups.filter((k) => k !== p);
  }

  // -------------------------------------------------------------------------
  // Movement & navigation

  moveBody(b: { x: number; y: number; r: number }, dx: number, dy: number, flying: boolean): boolean {
    const blocked = (x: number, y: number) => {
      const r = Math.min(b.r, 7);
      for (const [ox, oy] of [
        [-r, -r * 0.6],
        [r, -r * 0.6],
        [-r, r * 0.6],
        [r, r * 0.6],
      ]) {
        const t = this.map.get(Math.floor((x + ox) / TILE), Math.floor((y + oy) / TILE));
        if (flying ? t === T.Wall || t === T.Pillar || t === T.Void : t !== T.Floor) return true;
      }
      return false;
    };
    let moved = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    const sx = dx / steps;
    const sy = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (sx && !blocked(b.x + sx, b.y)) {
        b.x += sx;
        moved = true;
      }
      if (sy && !blocked(b.x, b.y + sy)) {
        b.y += sy;
        moved = true;
      }
    }
    return moved || (dx === 0 && dy === 0);
  }

  private updateFlowField(dt: number) {
    this.flowT -= dt;
    const p = this.player;
    const tile = Math.floor(p.y / TILE) * this.map.w + Math.floor(p.x / TILE);
    if (this.flowT > 0 && tile === this.flowTile) return;
    this.flowT = 0.3;
    this.flowTile = tile;
    const f = this.flow;
    f.fill(-1);
    const q = new Int32Array(this.map.w * this.map.h);
    let head = 0;
    let tail = 0;
    q[tail++] = tile;
    f[tile] = 0;
    const w = this.map.w;
    while (head < tail) {
      const i = q[head++];
      const x = i % w;
      const y = (i / w) | 0;
      const d = f[i];
      if (d > 60) continue;
      for (const [ddx, ddy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + ddx;
        const ny = y + ddy;
        if (!this.map.walkable(nx, ny)) continue;
        const ni = ny * w + nx;
        if (f[ni] >= 0) continue;
        f[ni] = d + 1;
        q[tail++] = ni;
      }
    }
  }

  private flowDir(x: number, y: number): { x: number; y: number } {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    const w = this.map.w;
    const here = this.flow[ty * w + tx];
    let best = here < 0 ? 9999 : here;
    let bx = 0;
    let by = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!this.map.walkable(nx, ny)) continue;
        if (dx && dy && (!this.map.walkable(tx + dx, ty) || !this.map.walkable(tx, ty + dy))) continue;
        const v = this.flow[ny * w + nx];
        if (v >= 0 && v < best) {
          best = v;
          bx = dx;
          by = dy;
        }
      }
    if (!bx && !by) return { x: 0, y: 0 };
    return norm((tx + bx + 0.5) * TILE - x, (ty + by + 0.5) * TILE - y);
  }
}

/** Defeats control-flow narrowing where a call may have killed the enemy. */
const isDead = (e: Enemy) => e.state === 'dead';

export function dir4(a: number): number {
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (Math.abs(c) > Math.abs(s) * 1.1) return c > 0 ? 3 : 2;
  return s > 0 ? 0 : 1;
}
