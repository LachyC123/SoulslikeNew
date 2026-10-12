import { angleDiff, damp, norm } from '../core/math';
import { Rng } from '../core/rng';
import { BOSS, EnemyDef, ENEMIES } from '../data/enemies';
import { FAMILIES, Item } from '../data/items';
import { EnemyKind, FloorPlan } from '../world/gen';
import { Room, T, TILE, TileMap } from '../world/tiles';
import { newStatus, Player, StatusState, weaponStats, WeaponStats } from './player';

// ---------------------------------------------------------------------------
// Presentation sink: simulation reports what happened, presentation decides how it looks.

export type NumKind = 'hit' | 'crit' | 'hurt' | 'heal' | 'poison' | 'shatter' | 'gold';
export type BurstKind =
  | 'hit'
  | 'heavyHit'
  | 'shatter'
  | 'freeze'
  | 'spores'
  | 'poisonTick'
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
  | 'roar';
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
  | 'ui';

export interface FxSink {
  number(x: number, y: number, text: string, kind: NumKind): void;
  burst(kind: BurstKind, x: number, y: number, angle?: number, scale?: number): void;
  sound(id: SoundId, vol?: number): void;
  shake(amount: number): void;
  hitstop(t: number): void;
  toast(msg: string, kind?: 'info' | 'synergy' | 'warn'): void;
}

export const nullFx: FxSink = {
  number() {},
  burst() {},
  sound() {},
  shake() {},
  hitstop() {},
  toast() {},
};

export interface Intent {
  mx: number;
  my: number;
  /** Explicit aim angle (mouse or drag-aim), null for assisted aim. */
  aim: number | null;
  attack: boolean;
  attackHeld: boolean;
  dodge: boolean;
  skill: boolean;
  swap: boolean;
  flask: boolean;
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
  vx: number;
  vy: number;
  kx: number;
  ky: number;
  hp: number;
  maxHp: number;
  poise: number;
  poiseMax: number;
  speed: number;
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
  mutation: 'sporeBurst' | 'frenzied' | null;
  poison: StatusState;
  frost: StatusState;
  resistBase: { poison: number; frost: number };
  flash: number;
  anim: number;
  token: boolean;
  lastHit: number;
  deadT: number;
  hitPlayer: boolean;
  boss: BossState | null;
}

export interface Projectile {
  id: number;
  owner: 'player' | 'enemy';
  kind: 'seed' | 'crescent';
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  damage: number;
  buildup: { kind: 'poison' | 'frost'; amount: number } | null;
  pierce: boolean;
  hit: Set<number>;
  src: Src;
  weapon: WeaponStats | null;
}

export interface Hazard {
  kind: 'eruption' | 'sporeCloud';
  x: number;
  y: number;
  r: number;
  /** Warning time remaining before it triggers. */
  warn: number;
  warnTotal: number;
  /** Active time remaining after trigger. */
  active: number;
  damage: number;
  buildup: number;
  done: boolean;
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

export interface Spring {
  id: number;
  x: number;
  y: number;
  used: boolean;
  room: number;
}

export type Interactable =
  | { kind: 'chest'; chest: Chest }
  | { kind: 'item'; pickup: Pickup }
  | { kind: 'spring'; spring: Spring }
  | { kind: 'stairs' };

export interface WorldCallbacks {
  /** Player wants to inspect an item (opens comparison; pauses play). */
  inspect(p: Pickup): void;
  /** Player committed to descending. */
  descend(): void;
  /** Rolls loot for a chest. */
  rollChestLoot(chest: Chest): Item;
  bossDefeated(): void;
  playerDied(): void;
  /** Permanent progress milestones are recorded immediately. */
  milestone(kind: 'kill' | 'boss', amount: number): void;
}

export interface FloorStateSave {
  opened: number[];
  killed: number[];
  springs: number[];
  ground: { x: number; y: number; item: Item }[];
  explored: number[];
  bossDead: boolean;
}

const MAX_ATTACK_TOKENS = 2;
const PLAYER_SPEED = 74;
const DODGE_TIME = 0.3;
const DODGE_DIST = 54;
const DODGE_IFRAMES = 0.24;
const DODGE_CD = 0.38;
const HURT_PROTECT = 0.7;

export class World {
  readonly map: TileMap;
  readonly rooms: Room[];
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  hazards: Hazard[] = [];
  pickups: Pickup[] = [];
  chests: Chest[] = [];
  springs: Spring[] = [];
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
  lastStatusToast = 0;
  private flow: Int16Array;
  private flowT = 0;
  private flowTile = -1;
  private combatRng: Rng;

  constructor(
    readonly plan: FloorPlan,
    readonly player: Player,
    readonly fx: FxSink,
    readonly cb: WorldCallbacks,
    combatSeed: number,
    saved?: FloorStateSave,
  ) {
    this.map = plan.map;
    this.rooms = plan.rooms;
    this.explored = new Uint8Array(plan.rooms.length);
    this.flow = new Int16Array(this.map.w * this.map.h);
    this.combatRng = new Rng(combatSeed);
    this.stairsOpen = !plan.boss;

    for (const s of plan.enemies) {
      if (saved?.killed.includes(s.id)) continue;
      this.enemies.push(this.makeEnemy(s.id, s.kind, s.x, s.y, s.room, s.elite));
    }
    for (const c of plan.chests)
      this.chests.push({ id: c.id, x: c.x, y: c.y, opened: !!saved?.opened.includes(c.id), guarded: c.guarded, t: 1, room: c.room });
    for (const f of plan.features) this.springs.push({ id: f.id, x: f.x, y: f.y, used: !!saved?.springs.includes(f.id), room: f.room });
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
  }

  // -------------------------------------------------------------------------
  // Construction helpers

  private makeEnemy(id: number, kind: EnemyKind, x: number, y: number, room: number, elite: boolean): Enemy {
    const def = ENEMIES[kind];
    const floorMul = 1 + (this.plan.floor - 1) * 0.18;
    const hp = Math.round(def.hp * floorMul * (elite ? 2.1 : 1));
    return {
      id,
      kind,
      def,
      name: (elite ? 'Elite ' : '') + def.name,
      x,
      y,
      r: def.radius * (elite ? 1.2 : 1),
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      hp,
      maxHp: hp,
      poise: def.poise * (elite ? 2 : 1),
      poiseMax: def.poise * (elite ? 2 : 1),
      speed: def.speed * (elite ? 1.08 : 1),
      state: 'idle',
      t: 0,
      cd: 0.5 + ((id * 37) % 10) / 10,
      aim: 0,
      ax: x,
      ay: y,
      facing: 1,
      aggro: false,
      room,
      elite,
      mutation: elite ? (id % 2 === 0 ? 'sporeBurst' : 'frenzied') : null,
      poison: newStatus(),
      frost: newStatus(),
      resistBase: { ...def.resist },
      flash: 0,
      anim: (id * 0.37) % 1,
      token: false,
      lastHit: -1,
      deadT: 0,
      hitPlayer: false,
      boss: null,
    };
  }

  private makeBoss(x: number, y: number, room: number): Enemy {
    return {
      id: 1,
      kind: 'boss',
      def: null,
      name: BOSS.name,
      x,
      y,
      r: BOSS.radius,
      vx: 0,
      vy: 0,
      kx: 0,
      ky: 0,
      hp: BOSS.hp,
      maxHp: BOSS.hp,
      poise: 9999,
      poiseMax: 9999,
      speed: BOSS.speed,
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
      mutation: null,
      poison: newStatus(),
      frost: newStatus(),
      resistBase: { ...BOSS.resist },
      flash: 0,
      anim: 0,
      token: false,
      lastHit: -1,
      deadT: 0,
      hitPlayer: false,
      boss: { phase: 1, move: null, last: [], marks: [], stunned: 0, chill: 0, chargeLen: 0, chargeDist: 0, followUp: false, awake: false },
    };
  }

  get boss(): Enemy | undefined {
    return this.enemies.find((e) => e.boss && e.state !== 'dead');
  }

  dropItem(item: Item, x: number, y: number, pop = true): Pickup {
    const p: Pickup = {
      id: this.nextId++,
      kind: 'item',
      x,
      y,
      z: pop ? 2 : 0,
      vz: pop ? 70 : 0,
      vx: pop ? (Math.random() - 0.5) * 30 : 0,
      vy: pop ? 18 : 0,
      item,
      amount: 1,
      t: 0,
    };
    this.pickups.push(p);
    return p;
  }

  private dropGold(x: number, y: number, amount: number) {
    const coins = Math.min(5, Math.max(1, Math.round(amount / 2)));
    for (let i = 0; i < coins; i++) {
      const a = Math.random() * Math.PI * 2;
      this.pickups.push({
        id: this.nextId++,
        kind: 'gold',
        x,
        y,
        z: 2,
        vz: 60 + Math.random() * 30,
        vx: Math.cos(a) * 30,
        vy: Math.sin(a) * 30,
        amount: Math.max(1, Math.round(amount / coins)),
        t: 0,
      });
    }
  }

  saveState(): FloorStateSave {
    return {
      opened: this.chests.filter((c) => c.opened).map((c) => c.id),
      killed: [...this.killed],
      springs: this.springs.filter((s) => s.used).map((s) => s.id),
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
    this.updatePlayer(dt, intent);
    this.updateExplored();
    this.updateFlowField(dt);
    this.updateBossTrigger();
    this.tokens = this.enemies.filter((e) => e.token).length;
    for (const e of this.enemies) {
      if (e.boss) this.updateBoss(e, dt);
      else this.updateEnemy(e, dt);
      this.updateStatuses(e, dt);
    }
    this.enemies = this.enemies.filter((e) => !(e.state === 'dead' && e.deadT > 0.6));
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updatePickups(dt);
    this.updatePlayerStatus(dt);
    this.updateInteract(dt, intent);
    for (const c of this.chests) c.t += dt;
    if (p.hp <= 0 && p.state !== 'dead') {
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
      if (tx >= r.x - 2 && tx < r.x + r.w + 2 && ty >= r.y - 2 && ty < r.y + r.h + 2) {
        if (!this.explored[r.id]) {
          this.explored[r.id] = 1;
          if (r.role === 'exit' || r.role === 'boss') this.fx.toast(r.role === 'boss' ? 'A great presence stirs beyond.' : 'You found the stairs.', 'info');
        }
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

    // Weapon swap respects attack state: only from free or recovery.
    if (intent.swap && p.swapLock <= 0 && (p.state === 'free' || (p.state === 'attack' && p.atkPhase === 'recovery'))) {
      const other = (1 - p.weaponIndex) as 0 | 1;
      if (p.loadout.weapons[other]) {
        p.weaponIndex = other;
        p.swapLock = 0.25;
        p.state = 'free';
        p.atkStep = 0;
        this.fx.sound('swap');
        this.fx.toast(`${p.loadout.weapons[other]!.name}`, 'info');
      }
    }

    // Dodge can cancel windup or recovery, never active impact frames.
    const canDodge =
      p.dodgeCd <= 0 &&
      (p.state === 'free' || (p.state === 'attack' && p.atkPhase !== 'active') || (p.state === 'skill' && p.stateT < 0.1));
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
      this.fx.sound('dodge');
      this.fx.burst('dust', p.x, p.y + 3);
      this.onDodge();
    }

    if (intent.flask && p.state === 'free' && p.flasks > 0 && p.hp < p.build.maxHp) {
      p.state = 'flask';
      p.stateT = 0;
      p.flasks--;
    }

    if (intent.skill && ws && p.skillCd[p.weaponIndex] <= 0 && (p.state === 'free' || (p.state === 'attack' && p.atkPhase === 'recovery'))) {
      this.startSkill(ws, intent);
    }

    if ((intent.attack || (intent.attackHeld && p.state === 'free')) && ws) {
      if (p.state === 'free') this.startAttack(ws, intent, 0);
      else if (p.state === 'attack') p.atkQueued = true;
    } else if (intent.attackHeld && p.state === 'attack' && p.atkPhase === 'recovery') p.atkQueued = true;

    switch (p.state) {
      case 'free': {
        p.comboIdle += dt;
        if (p.comboIdle > 0.45) p.atkStep = 0;
        break;
      }
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
        if (p.stateT >= 0.55) {
          const heal = Math.round(p.build.maxHp * 0.38 * p.build.flaskMul);
          p.hp = Math.min(p.build.maxHp, p.hp + heal);
          p.poison.active = 0;
          p.poison.build = 0;
          this.fx.number(p.x, p.y - 18, `+${heal}`, 'heal');
          this.fx.burst('heal', p.x, p.y - 6);
          this.fx.sound('heal');
          p.state = 'free';
        }
        break;
      }
    }

    if (p.state !== 'dodge') {
      const sp = PLAYER_SPEED * p.build.moveMul * speedMul;
      const tx = wantsMove ? mx * sp : 0;
      const ty = wantsMove ? my * sp : 0;
      const k = damp(wantsMove ? 22 : 18, dt);
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
      this.moveBody(p, p.vx * dt, p.vy * dt, false);
      if (wantsMove && p.state === 'free') p.face = Math.atan2(my, mx);
      if (wantsMove && p.state === 'flask') p.face = Math.atan2(my, mx);
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

  private chooseAim(intent: Intent, reach: number): number {
    const p = this.player;
    if (intent.aim !== null) return intent.aim;
    const desired = Math.hypot(intent.mx, intent.my) > 0.2 ? Math.atan2(intent.my, intent.mx) : p.face;
    // Aim assist keeps the current target during a combo instead of jumping between foes.
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
    const fam = FAMILIES[ws.family];
    const s = fam.combo[step % fam.combo.length];
    p.state = 'attack';
    p.stateT = 0;
    p.atkStep = step % fam.combo.length;
    p.atkPhase = 'windup';
    p.atkT = 0;
    p.atkQueued = false;
    p.atkId = this.nextId++;
    p.atkDir = this.chooseAim(intent, s.reach * ws.reachMul);
    p.face = p.atkDir;
    p.echoPending = p.echoArmed;
    p.echoArmed = false;
  }

  private updateAttack(ws: WeaponStats, dt: number, intent: Intent): number {
    const p = this.player;
    const fam = FAMILIES[ws.family];
    const s = fam.combo[p.atkStep];
    const sp = ws.speedMul;
    p.atkT += dt * sp;
    if (p.atkPhase === 'windup') {
      if (p.atkT >= s.windup) {
        p.atkPhase = 'active';
        p.atkT = 0;
        this.fx.sound(ws.heavy ? 'swingHeavy' : 'swing');
      }
      return ws.heavy ? 0.15 : 0.3;
    }
    if (p.atkPhase === 'active') {
      const lungeV = s.lunge / s.active;
      this.moveBody(p, Math.cos(p.atkDir) * lungeV * dt, Math.sin(p.atkDir) * lungeV * dt, false);
      this.resolveMelee(ws, s.reach * ws.reachMul, s.arc, s.mul, s.poise, p.atkId, p.atkStep === fam.combo.length - 1, {
        effect: 'basic',
        chain: [],
      });
      if (p.atkT >= s.active) {
        p.atkPhase = 'recovery';
        p.atkT = 0;
        if (p.echoPending) {
          p.echoPending = false;
          this.scheduleEcho(ws, s.reach * ws.reachMul, s.arc, s.mul, s.poise, p.atkStep === fam.combo.length - 1);
        }
      }
      return 0.1;
    }
    // recovery: buffered input chains the combo.
    if (p.atkQueued && p.atkT >= s.recovery * 0.35) {
      p.comboIdle = 0;
      this.startAttack(ws, intent, p.atkStep + 1);
      return 0.3;
    }
    if (p.atkT >= s.recovery) {
      p.state = 'free';
      p.comboIdle = 0;
      p.atkStep = (p.atkStep + 1) % fam.combo.length;
      if (p.atkStep === 0) p.comboIdle = 1;
    }
    return 0.4;
  }

  private echoQueue: { t: number; fn: () => void }[] = [];

  private scheduleEcho(ws: WeaponStats, reach: number, arc: number, mul: number, poise: number, finisher: boolean) {
    const p = this.player;
    const pct = p.build.shadowEcho / 100;
    const dir = p.atkDir;
    const ox = p.x;
    const oy = p.y;
    const id = this.nextId++;
    this.echoQueue.push({
      t: this.time + 0.16,
      fn: () => {
        this.fx.burst('hit', ox + Math.cos(dir) * reach * 0.6, oy + Math.sin(dir) * reach * 0.6, dir, 0.7);
        this.fx.sound(ws.heavy ? 'swingHeavy' : 'swing', 0.6);
        this.resolveMelee(ws, reach, arc, mul * pct, poise * 0.5, id, finisher, { effect: 'shadowEcho', chain: ['shadowEcho'] }, ox, oy, dir);
      },
    });
  }

  /** Arc hit test from the player (or a shadow echo origin). */
  private resolveMelee(
    ws: WeaponStats,
    reach: number,
    arc: number,
    mul: number,
    poise: number,
    atkId: number,
    finisher: boolean,
    src: Src,
    ox = this.player.x,
    oy = this.player.y,
    dir = this.player.atkDir,
  ) {
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.lastHit === atkId) continue;
      const dx = e.x - ox;
      const dy = e.y - oy;
      const d = Math.hypot(dx, dy);
      if (d - e.r > reach) continue;
      if (d > e.r + 4 && Math.abs(angleDiff(dir, Math.atan2(dy, dx))) > arc / 2) continue;
      if (!this.map.lineOfSight(ox, oy, e.x, e.y)) continue;
      e.lastHit = atkId;
      const shatters = ws.shatterAll || (ws.shatterFinisher && finisher);
      this.playerHit(e, ws, mul, poise, dir, shatters, src);
    }
  }

  private playerHit(e: Enemy, ws: WeaponStats, mul: number, poise: number, dir: number, shatters: boolean, src: Src) {
    const p = this.player;
    const crit = this.combatRng.next() < p.build.crit + ws.crit;
    const frozen = e.frost.active > 0 && !e.boss;
    let dmg = ws.damage * mul * p.build.dmgMul;
    if (crit) dmg *= 1 + p.build.critBonus;
    if (frozen && ws.rimed) dmg *= 1 + ws.rimed;
    if (e.boss && e.boss.stunned > 0) dmg *= 1.6;
    dmg = Math.max(1, Math.round(dmg));
    const heavy = ws.heavy;
    this.fx.burst(heavy ? 'heavyHit' : 'hit', e.x, e.y - 4, dir, heavy ? 1.3 : 1);
    this.fx.sound(crit ? 'crit' : heavy ? 'heavyHit' : 'hit');
    if (heavy) {
      this.fx.shake(2.5);
      this.fx.hitstop(0.07);
    } else this.fx.hitstop(crit ? 0.04 : 0.02);
    this.damageEnemy(e, dmg, src, { crit, poise, knock: heavy ? 110 : 55, dir, weapon: ws });
    if (e.state === 'dead') return;
    // Status buildup after damage so the meter reflects this hit.
    if (ws.item.element !== 'none' && ws.item.buildup > 0) {
      const mulB = ws.item.element === 'poison' ? p.build.poisonBuildMul : p.build.frostBuildMul;
      this.applyStatus(e, ws.item.element, ws.item.buildup * mulB * Math.min(1.5, mul), src);
    }
    if (shatters && frozen && e.frost.active > 0) this.shatter(e, ws, src);
  }

  private startSkill(ws: WeaponStats, intent: Intent) {
    const p = this.player;
    const fam = FAMILIES[ws.family];
    p.state = 'skill';
    p.stateT = 0;
    p.skillId = fam.skill.id;
    p.skillHit = false;
    p.skillDir = this.chooseAim(intent, 60);
    p.face = p.skillDir;
    p.skillCd[p.weaponIndex] = fam.skill.cooldown;
    p.atkId = this.nextId++;
    this.fx.sound('skill');
  }

  private updateSkill(ws: WeaponStats, dt: number): number {
    const p = this.player;
    const t = p.stateT;
    const dir = p.skillDir;
    if (p.skillId === 'crescent') {
      if (t >= 0.12 && !p.skillHit) {
        p.skillHit = true;
        this.projectiles.push({
          id: this.nextId++,
          owner: 'player',
          kind: 'crescent',
          x: p.x + Math.cos(dir) * 10,
          y: p.y - 4 + Math.sin(dir) * 10,
          vx: Math.cos(dir) * 175,
          vy: Math.sin(dir) * 175,
          r: 10,
          life: 0.75,
          damage: 1.7,
          buildup: ws.item.element !== 'none' ? { kind: ws.item.element as 'poison' | 'frost', amount: ws.item.buildup * 1.5 } : null,
          pierce: true,
          hit: new Set(),
          src: { effect: 'skill', chain: [] },
          weapon: ws,
        });
        this.fx.sound('swing');
      }
      if (t >= 0.35) p.state = 'free';
      return 0.3;
    }
    if (p.skillId === 'lunge') {
      p.invuln = Math.max(p.invuln, 0.05);
      if (t < 0.2) {
        const v = 360;
        this.moveBody(p, Math.cos(dir) * v * dt, Math.sin(dir) * v * dt, false);
        // Two cuts along the path: first half and second half each count as distinct attacks.
        const id = t < 0.1 ? p.atkId : p.atkId + 0.5;
        this.resolveMelee(ws, 18, Math.PI * 2, 1.25, 20, id, true, { effect: 'skill', chain: [] }, p.x, p.y, dir);
      }
      if (t >= 0.32) {
        p.state = 'free';
        p.atkStep = 0;
      }
      return 0;
    }
    // fracture
    if (t >= 0.42 && !p.skillHit) {
      p.skillHit = true;
      const cx = p.x + Math.cos(dir) * 12;
      const cy = p.y + Math.sin(dir) * 12;
      this.fx.burst('fracture', cx, cy, dir, 1);
      this.fx.shake(5);
      this.fx.hitstop(0.09);
      this.fx.sound('heavyHit');
      for (const e of this.enemies) {
        if (e.state === 'dead') continue;
        if (Math.hypot(e.x - cx, e.y - cy) - e.r > 54) continue;
        if (!this.map.lineOfSight(cx, cy, e.x, e.y)) continue;
        this.playerHit(e, ws, 1.8, 120, Math.atan2(e.y - cy, e.x - cx), true, { effect: 'skill', chain: [] });
      }
    }
    if (t >= 0.9) p.state = 'free';
    return t < 0.42 ? 0.15 : 0.05;
  }

  // -------------------------------------------------------------------------
  // Damage, statuses and the event rules (with recursion guard).

  private child(src: Src, effect: string): Src | null {
    const repeats = src.chain.filter((e) => e === effect).length;
    // An effect may cascade through other effects, but can only re-trigger itself a bounded number of times.
    if (src.chain.length >= 6 || repeats >= 3) return null;
    return { effect, chain: [...src.chain, effect] };
  }

  damageEnemy(
    e: Enemy,
    dmg: number,
    src: Src,
    opts: { crit?: boolean; poise?: number; knock?: number; dir?: number; weapon?: WeaponStats | null; kind?: NumKind } = {},
  ): void {
    if (e.state === 'dead') return;
    e.hp -= dmg;
    e.flash = 0.12;
    this.fx.number(e.x, e.y - e.r - 10, `${dmg}`, opts.kind ?? (opts.crit ? 'crit' : 'hit'));
    if (!e.aggro) this.alert(e);
    if (opts.knock && opts.dir !== undefined && !e.boss) {
      const k = opts.knock * (e.elite ? 0.5 : 1);
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
    if (e.hp <= 0) this.killEnemy(e, src, opts.weapon ?? null);
  }

  private killEnemy(e: Enemy, src: Src, weapon: WeaponStats | null) {
    const p = this.player;
    const wasPoisoned = e.poison.active > 0;
    e.hp = 0;
    e.state = 'dead';
    e.deadT = 0;
    this.releaseToken(e);
    this.killed.add(e.id);
    this.kills++;
    this.cb.milestone('kill', 1);
    this.fx.burst(e.boss ? 'bossDeath' : 'death', e.x, e.y - 4, 0, e.r / 7);
    this.fx.sound('death');
    if (e.boss) {
      this.onBossDefeated(e);
      return;
    }
    const def = e.def!;
    const gold = Math.round((def.gold[0] + Math.random() * (def.gold[1] - def.gold[0])) * (e.elite ? 3 : 1));
    this.dropGold(e.x, e.y, gold);
    if (Math.random() < (e.elite ? 0.6 : 0.07)) {
      this.pickups.push({ id: this.nextId++, kind: 'orb', x: e.x, y: e.y, z: 2, vz: 50, vx: 0, vy: 10, amount: 10, t: 0 });
    }
    if (e.mutation === 'sporeBurst') this.addHazard('sporeCloud', e.x, e.y, 26, 0.7, 12, 45);
    // Event: kill
    if (weapon?.reaper) {
      p.hp = Math.min(p.build.maxHp, p.hp + weapon.reaper);
      this.fx.number(p.x, p.y - 18, `+${weapon.reaper}`, 'heal');
    }
    if (wasPoisoned && p.build.sporeBloom > 0) {
      const c = this.child(src, 'sporeBloom');
      if (c) {
        this.fx.burst('spores', e.x, e.y - 3, 0, 1.2);
        this.fx.sound('poison');
        for (const o of this.enemies) {
          if (o === e || o.state === 'dead') continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) - o.r < 44) this.applyStatus(o, 'poison', p.build.sporeBloom, c);
        }
      }
    }
  }

  applyStatus(e: Enemy, kind: 'poison' | 'frost', amount: number, src: Src): void {
    if (e.state === 'dead') return;
    const s = e[kind];
    s.build += amount;
    s.idle = 0;
    const threshold = e.resistBase[kind] * s.resist;
    if (s.build < threshold) return;
    s.build = 0;
    if (kind === 'poison') {
      // Poison does not stack: reaching the threshold again only refreshes duration.
      const fresh = s.active <= 0;
      s.active = 5;
      s.tick = 0.5;
      if (fresh) {
        this.fx.burst('spores', e.x, e.y - 4, 0, 0.6);
        this.fx.sound('poison', 0.7);
      }
      return;
    }
    // Frost
    if (e.boss) {
      // Bosses never freeze solid: they become chilled (slowed) and briefly staggered.
      e.boss.chill = 4;
      s.resist *= 1.5;
      this.fx.burst('freeze', e.x, e.y - 6, 0, 2);
      this.fx.sound('freeze');
      this.fx.toast('The Warden is chilled — slowed!', 'synergy');
      return;
    }
    s.active = 2.2;
    s.resist *= 1.5;
    this.releaseToken(e);
    if (e.state === 'windup' || e.state === 'active') {
      e.state = 'recover';
      e.t = 0;
    }
    e.kx = e.ky = 0;
    this.fx.burst('freeze', e.x, e.y - 4, 0, 1);
    this.fx.sound('freeze');
    void src;
  }

  private shatter(e: Enemy, ws: WeaponStats | null, src: Src) {
    const p = this.player;
    e.frost.active = 0;
    const dmg = Math.round(e.maxHp * 0.3 + (ws ? ws.damage * 0.8 : 10));
    this.fx.burst('shatter', e.x, e.y - 4, 0, 1.3);
    this.fx.sound('shatter');
    this.fx.hitstop(0.1);
    this.fx.shake(4);
    const c = this.child(src, 'shatter');
    this.damageEnemy(e, dmg, c ?? src, { kind: 'shatter', weapon: ws });
    // Shards hurt neighbours a little.
    for (const o of this.enemies) {
      if (o === e || o.state === 'dead') continue;
      if (Math.hypot(o.x - e.x, o.y - e.y) - o.r < 30) this.damageEnemy(o, Math.round(dmg * 0.25), c ?? src, { kind: 'shatter' });
    }
    if (p.build.frostNova > 0 && c) {
      const nova = this.child(c, 'frostNova');
      if (nova) {
        this.fx.burst('frostStep', e.x, e.y, 0, 1.6);
        for (const o of this.enemies) {
          if (o === e || o.state === 'dead') continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) - o.r < 48) this.applyStatus(o, 'frost', p.build.frostNova, nova);
        }
      }
    }
  }

  private onDodge() {
    const p = this.player;
    if (p.build.shadowEcho > 0) p.echoArmed = true;
    if (p.build.frostStep > 0) {
      this.fx.burst('frostStep', p.x, p.y, 0, 1);
      for (const e of this.enemies) {
        if (e.state === 'dead') continue;
        if (Math.hypot(e.x - p.x, e.y - p.y) - e.r < 38) this.applyStatus(e, 'frost', p.build.frostStep, { effect: 'frostStep', chain: ['frostStep'] });
      }
    }
  }

  private updateStatuses(e: Enemy, dt: number) {
    if (e.state === 'dead') {
      e.deadT += dt;
      return;
    }
    for (const kind of ['poison', 'frost'] as const) {
      const s = e[kind];
      s.idle += dt;
      if (s.idle > 1.6 && s.build > 0) s.build = Math.max(0, s.build - 28 * dt);
      if (s.active <= 0 && s.resist > 1) s.resist = Math.max(1, s.resist - 0.04 * dt);
    }
    if (e.poison.active > 0) {
      e.poison.active -= dt;
      e.poison.tick -= dt;
      if (e.poison.tick <= 0) {
        e.poison.tick = 0.5;
        const dmg = Math.max(2, Math.round((e.boss ? 0.01 : 0.04) * e.maxHp * this.player.build.poisonDmgMul));
        this.fx.burst('poisonTick', e.x, e.y - 6);
        this.damageEnemy(e, dmg, { effect: 'poisonTick', chain: ['poisonTick'] }, { kind: 'poison' });
      }
    }
    if (e.frost.active > 0) {
      e.frost.active -= dt;
      if (e.frost.active <= 0) this.fx.burst('dust', e.x, e.y);
    }
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

  private updateEnemy(e: Enemy, dt: number) {
    if (e.state === 'dead') return;
    const p = this.player;
    const def = e.def!;
    e.flash = Math.max(0, e.flash - dt);
    e.anim += dt;
    // Knockback decays.
    if (e.kx || e.ky) {
      this.moveBody(e, e.kx * dt, e.ky * dt, def.flying);
      const k = damp(10, dt);
      e.kx -= e.kx * k;
      e.ky -= e.ky * k;
      if (Math.abs(e.kx) + Math.abs(e.ky) < 2) e.kx = e.ky = 0;
    }
    if (e.frost.active > 0) return;

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const d = Math.hypot(dx, dy);
    if (!e.aggro && p.state !== 'dead') {
      const r = this.roomAt(p.x, p.y);
      if ((r && r.id === e.room) || (d < 110 && this.map.lineOfSight(e.x, e.y, p.x, p.y))) this.alert(e);
    }
    const frenzy = e.mutation === 'frenzied' ? 0.75 : 1;
    e.cd -= dt;
    e.t += dt;
    const atk = def.attack;
    switch (e.state) {
      case 'idle': {
        // Gentle idle drift.
        if (e.aggro) e.state = 'chase';
        break;
      }
      case 'chase': {
        if (p.state === 'dead') break;
        if (dx !== 0) e.facing = dx > 0 ? 1 : -1;
        const los = d < 170 && this.map.lineOfSight(e.x, e.y, p.x, p.y);
        const inRange = d <= atk.range + p.r && (atk.kind !== 'shoot' || los);
        if (inRange && e.cd <= 0 && this.tokens < MAX_ATTACK_TOKENS) {
          e.state = 'windup';
          e.t = 0;
          e.token = true;
          this.tokens++;
          e.aim = Math.atan2(dy, dx);
          e.ax = e.x + Math.cos(e.aim) * atk.offset;
          e.ay = e.y + Math.sin(e.aim) * atk.offset;
          e.hitPlayer = false;
          this.fx.sound('enemyWarn', 0.5);
          break;
        }
        // Movement: approach, or keep distance for ranged units.
        let mvx = 0;
        let mvy = 0;
        if (def.keepDistance > 0 && los) {
          const want = d - def.keepDistance;
          if (Math.abs(want) > 12) {
            mvx = (dx / d) * Math.sign(want);
            mvy = (dy / d) * Math.sign(want);
          } else {
            // Strafe.
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
        // Waiting for an attack token: hold position at a respectful distance.
        if (this.tokens >= MAX_ATTACK_TOKENS && !e.token && d < atk.range + 20 && def.keepDistance === 0) {
          mvx = (-dy / d) * 0.4;
          mvy = (dx / d) * 0.4;
        }
        // Separation from other enemies.
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
        // Keep a little personal space around the player (bodies don't overlap).
        if (d > 0 && d < e.r + p.r + 2 && p.state !== 'dodge') {
          mvx -= (dx / d) * 1.5;
          mvy -= (dy / d) * 1.5;
        }
        const sp = e.speed / frenzy;
        e.vx += (mvx * sp - e.vx) * damp(8, dt);
        e.vy += (mvy * sp - e.vy) * damp(8, dt);
        this.moveBody(e, e.vx * dt, e.vy * dt, def.flying);
        break;
      }
      case 'windup': {
        const wind = atk.windup * frenzy;
        // Ranged units track during the first half, then lock their aim (readable).
        if (atk.kind === 'shoot' && e.t < wind * 0.5) e.aim = Math.atan2(dy, dx);
        if (atk.kind === 'lunge' && e.t < wind * 0.4) e.aim = Math.atan2(dy, dx);
        e.facing = Math.cos(e.aim) >= 0 ? 1 : -1;
        if (e.t >= wind) {
          e.state = 'active';
          e.t = 0;
          if (atk.kind === 'shoot') {
            this.projectiles.push({
              id: this.nextId++,
              owner: 'enemy',
              kind: 'seed',
              x: e.x + Math.cos(e.aim) * 8,
              y: e.y - 6 + Math.sin(e.aim) * 8,
              vx: Math.cos(e.aim) * atk.size,
              vy: Math.sin(e.aim) * atk.size,
              r: 3,
              life: 2,
              damage: Math.round(atk.damage * (e.elite ? 1.3 : 1) * this.floorDmg()),
              buildup: atk.buildup ?? null,
              pierce: false,
              hit: new Set(),
              src: { effect: 'enemy', chain: [] },
              weapon: null,
            });
            this.fx.sound('shoot', 0.6);
          }
        }
        break;
      }
      case 'active': {
        if (atk.kind === 'slam') {
          if (!e.hitPlayer && Math.hypot(p.x - e.ax, p.y - e.ay) < atk.size + p.r) {
            e.hitPlayer = true;
            this.hurtPlayer(Math.round(atk.damage * (e.elite ? 1.3 : 1) * this.floorDmg()), e.name, e.aim, e);
          }
          if (e.t < dt * 1.5) {
            this.fx.burst('leaves', e.ax, e.ay, e.aim, 1);
            this.fx.shake(1);
          }
        } else if (atk.kind === 'lunge') {
          this.moveBody(e, Math.cos(e.aim) * atk.size * dt, Math.sin(e.aim) * atk.size * dt, false);
          if (!e.hitPlayer && Math.hypot(p.x - e.x, p.y - e.y) < e.r + p.r + 2) {
            e.hitPlayer = true;
            this.hurtPlayer(Math.round(atk.damage * (e.elite ? 1.3 : 1) * this.floorDmg()), e.name, e.aim, e);
          }
        }
        if (e.t >= atk.active) {
          e.state = 'recover';
          e.t = 0;
          this.releaseToken(e);
        }
        break;
      }
      case 'recover': {
        if (e.t >= atk.recovery * frenzy) {
          e.state = 'chase';
          e.t = 0;
          e.cd = atk.cooldown * frenzy * (0.8 + Math.random() * 0.5);
        }
        break;
      }
      case 'stagger': {
        if (e.t >= 0.45) {
          e.state = 'chase';
          e.t = 0;
          e.cd = Math.max(e.cd, 0.4);
        }
        break;
      }
    }
  }

  private floorDmg() {
    return 1 + (this.plan.floor - 1) * 0.15;
  }

  hurtPlayer(dmg: number, cause: string, dir: number, attacker: Enemy | null): void {
    const p = this.player;
    if (p.state === 'dead' || p.invuln > 0 || p.hurtT > 0) return;
    const reduced = Math.max(1, Math.round(dmg * (100 / (100 + p.build.defense * 6))));
    p.hp -= reduced;
    p.hurtT = HURT_PROTECT;
    p.flash = 0.2;
    p.causeOfDeath = cause;
    p.vx += Math.cos(dir) * 90;
    p.vy += Math.sin(dir) * 90;
    this.fx.number(p.x, p.y - 20, `${reduced}`, 'hurt');
    this.fx.sound('hurt');
    this.fx.shake(3);
    this.fx.hitstop(0.05);
    if (attacker && p.build.thorns > 0 && attacker.state !== 'dead') {
      this.applyStatus(attacker, 'poison', p.build.thorns, { effect: 'thorns', chain: ['thorns'] });
    }
  }

  private updatePlayerStatus(dt: number) {
    const p = this.player;
    const s = p.poison;
    s.idle += dt;
    if (s.idle > 1.5 && s.build > 0) s.build = Math.max(0, s.build - 30 * dt);
    if (s.active > 0) {
      s.active -= dt;
      s.tick -= dt;
      if (s.tick <= 0) {
        s.tick = 0.7;
        p.hp -= 2;
        p.causeOfDeath = 'Poison';
        this.fx.number(p.x, p.y - 20, '2', 'poison');
        this.fx.burst('poisonTick', p.x, p.y - 8);
      }
    }
  }

  private applyPlayerStatus(amount: number) {
    const p = this.player;
    if (p.invuln > 0) return;
    p.poison.build += amount;
    p.poison.idle = 0;
    if (p.poison.build >= 100) {
      p.poison.build = 0;
      if (p.poison.active <= 0) this.fx.toast('Poisoned! Drink a flask to cleanse.', 'warn');
      p.poison.active = 4.5;
      p.poison.tick = 0.7;
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
      // Close the arena: seal corridor tiles touching the room edge.
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
      this.fx.toast('The Warden’s roots tear free — it grows faster!', 'warn');
      this.fx.sound('bossRoar');
      this.fx.burst('roar', e.x, e.y - 10);
      this.fx.shake(5);
      return;
    }
    const p2 = b.phase === 2;
    switch (e.state) {
      case 'chase': {
        if (dx) e.facing = dx > 0 ? 1 : -1;
        const sp = (e.speed * (p2 ? 1.25 : 1)) / chillMul;
        if (d > 40) this.moveBody(e, (dx / d) * sp * dt, (dy / d) * sp * dt, false);
        if (e.t > (p2 ? 0.6 : 1.0) * chillMul) {
          const choices: BossMove[] = d < 64 ? ['sweep', 'sweep', 'erupt'] : ['charge', 'erupt', 'charge'];
          let move = choices[Math.floor(this.combatRng.next() * choices.length)];
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
            for (const m of b.marks) this.addHazard('eruption', m.x, m.y, 15, 0, p2 ? 18 : 16, 0, 0.3);
            b.marks = [];
          } else if (b.move === 'sweep') {
            this.fx.sound('swingHeavy');
            this.fx.burst('leaves', e.x + Math.cos(e.aim) * 30, e.y + Math.sin(e.aim) * 30, e.aim, 2);
          } else if (b.move === 'roar') {
            this.fx.burst('roar', e.x, e.y - 10);
          }
        }
        break;
      }
      case 'active': {
        if (b.move === 'sweep') {
          if (!e.hitPlayer && d < 52 + p.r && Math.abs(angleDiff(e.aim, Math.atan2(dy, dx))) < (200 * Math.PI) / 360) {
            e.hitPlayer = true;
            this.hurtPlayer(p2 ? 20 : 18, BOSS.name, e.aim, e);
          }
          if (e.t > 0.15) this.endBossMove(e);
        } else if (b.move === 'charge') {
          const v = p2 ? 280 : 240;
          const step = v * dt;
          const moved = this.moveBody(e, Math.cos(e.aim) * step, Math.sin(e.aim) * step, false);
          b.chargeDist += step;
          if (Math.random() < 0.6) this.fx.burst('dust', e.x, e.y + 8);
          if (!e.hitPlayer && d < e.r + p.r + 3) {
            e.hitPlayer = true;
            this.hurtPlayer(22, BOSS.name, e.aim, e);
          }
          if (!moved) {
            // A missed charge into a wall exposes the vulnerable core.
            b.stunned = 2.4;
            e.state = 'stagger';
            this.fx.shake(6);
            this.fx.sound('heavyHit');
            this.fx.burst('fracture', e.x + Math.cos(e.aim) * 14, e.y + Math.sin(e.aim) * 14, e.aim, 1);
            this.fx.toast('Its core is exposed — strike now!', 'synergy');
            this.endBossMove(e, true);
          } else if (b.chargeDist >= b.chargeLen + 30 || e.t > 1.6) this.endBossMove(e);
        } else if (b.move === 'erupt') {
          if (e.t > 0.35) this.endBossMove(e);
        } else if (b.move === 'roar') {
          if (e.t > 0.5) this.endBossMove(e);
        }
        break;
      }
      case 'recover': {
        if (e.t > (p2 ? 0.5 : 0.75) * chillMul) {
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
  }

  private bossWindup(m: BossMove, p2: boolean, follow: boolean): number {
    if (m === 'sweep') return follow ? 0.5 : p2 ? 0.7 : 0.85;
    if (m === 'charge') return p2 ? 0.8 : 0.95;
    if (m === 'erupt') return p2 ? 0.95 : 1.1;
    return 1.2;
  }

  private startBossMove(e: Enemy, move: BossMove, followed = false) {
    const b = e.boss!;
    const p = this.player;
    b.move = move;
    b.last = [move, ...b.last].slice(0, 2);
    e.state = 'windup';
    e.t = 0;
    e.aim = followed ? e.aim + Math.PI * 0.0 : Math.atan2(p.y - e.y, p.x - e.x);
    this.fx.sound('enemyWarn');
    if (move === 'erupt') {
      const n = b.phase === 2 ? 6 : 3;
      b.marks = [{ x: p.x, y: p.y }];
      for (let i = 1; i < n; i++) {
        const a = this.combatRng.next() * Math.PI * 2;
        const r = 26 + this.combatRng.next() * 40;
        const mx = p.x + Math.cos(a) * r;
        const my = p.y + Math.sin(a) * r;
        if (!this.map.solidAt(mx, my)) b.marks.push({ x: mx, y: my });
      }
    }
    if (move === 'charge') b.chargeLen = this.rayLength(e.x, e.y, e.aim, 300);
    if (move === 'sweep' && b.phase === 2 && !followed) b.followUp = true;
  }

  private endBossMove(e: Enemy, stunned = false) {
    if (!stunned) {
      e.state = 'recover';
    }
    e.t = 0;
  }

  private onBossDefeated(e: Enemy) {
    this.bossFight = 'done';
    this.stairsOpen = true;
    this.hazards = [];
    for (const g of this.gates) this.map.set(g.x, g.y, T.Floor);
    this.gates = [];
    this.fx.shake(8);
    this.fx.hitstop(0.25);
    this.fx.sound('bossRoar');
    this.cb.milestone('boss', 1);
    this.dropGold(e.x, e.y, 60);
    this.cb.bossDefeated();
  }

  rayLength(x: number, y: number, a: number, max: number): number {
    for (let d = 0; d < max; d += 4) if (this.map.solidAt(x + Math.cos(a) * d, y + Math.sin(a) * d)) return Math.max(0, d - 8);
    return max;
  }

  private addHazard(kind: Hazard['kind'], x: number, y: number, r: number, warn: number, damage: number, buildup: number, active = 0.3) {
    this.hazards.push({ kind, x, y, r, warn, warnTotal: Math.max(warn, 0.001), active, damage, buildup, done: false });
  }

  // -------------------------------------------------------------------------
  // Projectiles, hazards, pickups

  private updateProjectiles(dt: number) {
    const p = this.player;
    for (const pr of this.projectiles) {
      pr.life -= dt;
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      if (this.map.blocksProjectile(pr.x, pr.y + (pr.owner === 'enemy' ? 6 : 4))) {
        pr.life = 0;
        this.fx.burst(pr.kind === 'seed' ? 'spores' : 'hit', pr.x, pr.y, 0, 0.5);
        continue;
      }
      if (pr.owner === 'enemy') {
        if (Math.hypot(p.x - pr.x, p.y - 6 - pr.y) < pr.r + p.r + 1 && p.invuln <= 0 && p.hurtT <= 0 && p.state !== 'dead') {
          this.hurtPlayer(pr.damage, 'Lantern Moth', Math.atan2(pr.vy, pr.vx), null);
          if (pr.buildup) this.applyPlayerStatus(pr.buildup.amount);
          this.fx.burst('spores', pr.x, pr.y, 0, 0.6);
          pr.life = 0;
        }
      } else {
        for (const e of this.enemies) {
          if (e.state === 'dead' || pr.hit.has(e.id)) continue;
          if (Math.hypot(e.x - pr.x, e.y - 4 - pr.y) < pr.r + e.r) {
            pr.hit.add(e.id);
            if (pr.weapon) this.playerHit(e, pr.weapon, pr.damage, 30, Math.atan2(pr.vy, pr.vx), false, pr.src);
            if (!pr.pierce) pr.life = 0;
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
          this.fx.burst(h.kind === 'eruption' ? 'erupt' : 'spores', h.x, h.y, 0, h.r / 14);
          if (h.kind === 'eruption') this.fx.shake(1.5);
        }
        continue;
      }
      h.active -= dt;
      if (!h.done && Math.hypot(p.x - h.x, p.y - h.y) < h.r + p.r) {
        h.done = true;
        if (h.damage) this.hurtPlayer(h.damage, h.kind === 'eruption' ? BOSS.name : 'Spore burst', Math.atan2(p.y - h.y, p.x - h.x), null);
        if (h.buildup) this.applyPlayerStatus(h.buildup);
      }
    }
    this.hazards = this.hazards.filter((h) => h.warn > 0 || h.active > 0);
    // Shadow echoes
    if (this.echoQueue.length) {
      const due = this.echoQueue.filter((q) => q.t <= this.time);
      this.echoQueue = this.echoQueue.filter((q) => q.t > this.time);
      for (const q of due) q.fn();
    }
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
      if (k.t > 0.4 && d < 36) {
        const pull = 260 * dt;
        k.x += ((p.x - k.x) / d) * Math.min(pull, d);
        k.y += ((p.y - k.y) / d) * Math.min(pull, d);
      }
      if (k.t > 0.4 && d < 7) {
        if (k.kind === 'gold') {
          p.gold += k.amount;
          this.fx.sound('gold', 0.5);
        } else {
          p.hp = Math.min(p.build.maxHp, p.hp + k.amount);
          this.fx.number(p.x, p.y - 18, `+${k.amount}`, 'heal');
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
    for (const s of this.springs) {
      if (s.used) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = { kind: 'spring', spring: s };
      }
    }
    if (this.stairsOpen) {
      const sc = this.stairsCenter();
      const d = Math.hypot(sc.x - p.x, sc.y - p.y);
      if (d < 26 && d < bestD + 6) best = { kind: 'stairs' };
    }
    this.nearby = best;

    if (best?.kind === 'stairs') {
      // Holding briefly prevents accidental departure.
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
      this.dropGold(c.x, c.y, 6 + this.plan.floor * 3 + (c.guarded ? 10 : 0));
    } else if (best.kind === 'item') {
      this.cb.inspect(best.pickup);
    } else if (best.kind === 'spring') {
      const s = best.spring;
      s.used = true;
      const heal = Math.round(p.build.maxHp * 0.4);
      p.hp = Math.min(p.build.maxHp, p.hp + heal);
      p.flasks = Math.min(p.maxFlasks, p.flasks + 1);
      p.poison.active = 0;
      this.fx.number(p.x, p.y - 18, `+${heal}`, 'heal');
      this.fx.burst('heal', s.x, s.y - 4, 0, 1.5);
      this.fx.sound('heal');
      this.fx.toast('The moss spring restores you (+1 flask).', 'info');
    }
  }

  removePickup(p: Pickup) {
    this.pickups = this.pickups.filter((k) => k !== p);
  }

  // -------------------------------------------------------------------------
  // Movement & navigation

  /** Axis-separated circle-vs-grid movement. Returns false if fully blocked. */
  moveBody(b: { x: number; y: number; r: number }, dx: number, dy: number, flying: boolean): boolean {
    const blocked = (x: number, y: number) => {
      const r = b.r;
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
    // Sub-step large moves to avoid tunnelling.
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
        // Avoid cutting wall corners on diagonals.
        if (dx && dy && (!this.map.walkable(tx + dx, ty) || !this.map.walkable(tx, ty + dy))) continue;
        const v = this.flow[ny * w + nx];
        if (v >= 0 && v < best) {
          best = v;
          bx = dx;
          by = dy;
        }
      }
    if (!bx && !by) return { x: 0, y: 0 };
    const cx = (tx + bx + 0.5) * TILE;
    const cy = (ty + by + 0.5) * TILE;
    return norm(cx - x, cy - y);
  }
}

export function dir4(a: number): number {
  const c = Math.cos(a);
  const s = Math.sin(a);
  if (Math.abs(c) > Math.abs(s) * 1.1) return c > 0 ? 3 : 2;
  return s > 0 ? 0 : 1;
}

