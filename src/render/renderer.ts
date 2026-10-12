import { damp } from '../core/math';
import { hash2 } from '../core/rng';
import { FAMILIES } from '../data/items';
import { Settings } from '../save/save';
import { weaponStats } from '../sim/player';
import { Enemy, World } from '../sim/world';
import { TILE } from '../world/tiles';
import { drawText, textWidth } from './font';
import { elementGlow, heldWeapon } from './icons';
import { Particles } from './particles';
import { canvas, ctx2d } from './pixel';
import { BOOT_LOOKS, CHEST_LOOKS, DEFAULT_LOOK, enemySprites, playerFrames, PlayerLook, propSprites, wardenSprite } from './sprites';
import { buildFloorVisuals, FloorVisuals } from './tilerender';
import { RegionTheme } from './theme';

const TELEGRAPH = '255, 179, 64';
const TELEGRAPH_HOT = '255, 120, 60';

export class Renderer {
  readonly screen: HTMLCanvasElement;
  readonly low: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private sg: CanvasRenderingContext2D;
  vw = 400;
  vh = 225;
  scale = 3;
  camX = 0;
  camY = 0;
  shakeAmt = 0;
  private shakeX = 0;
  private shakeY = 0;
  vis: FloorVisuals | null = null;
  particles = new Particles();
  hurtFlash = 0;
  hidePlayer = false;
  private time = 0;
  private visKey = '';

  constructor(
    screen: HTMLCanvasElement,
    public theme: RegionTheme,
    public settings: Settings,
  ) {
    this.screen = screen;
    this.sg = ctx2d(screen);
    this.low = canvas(this.vw, this.vh);
    this.g = ctx2d(this.low);
    this.resize();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(180, window.innerHeight);
    // Integer scaling keeps every pixel the same size; target ~230 logical px tall.
    const s = Math.max(1, Math.round((h * dpr) / 236));
    this.scale = s;
    this.vw = Math.ceil((w * dpr) / s);
    this.vh = Math.ceil((h * dpr) / s);
    this.low.width = this.vw;
    this.low.height = this.vh;
    this.g = ctx2d(this.low);
    this.screen.width = this.vw * s;
    this.screen.height = this.vh * s;
    this.screen.style.width = `${(this.vw * s) / dpr}px`;
    this.screen.style.height = `${(this.vh * s) / dpr}px`;
    this.sg = ctx2d(this.screen);
  }

  /** World → CSS pixel position (for DOM prompts anchored to the world). */
  toScreen(x: number, y: number): { x: number; y: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    return { x: ((x - this.camX) * this.scale) / dpr, y: ((y - this.camY) * this.scale) / dpr };
  }

  toWorld(sx: number, sy: number): { x: number; y: number } {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    return { x: (sx * dpr) / this.scale + this.camX, y: (sy * dpr) / this.scale + this.camY };
  }

  prepareFloor(world: World): void {
    const key = `${world.plan.seed}:${world.plan.floor}`;
    if (key !== this.visKey) {
      this.vis = buildFloorVisuals(world.plan, this.theme);
      this.visKey = key;
    }
    this.particles = new Particles();
    this.particles.lowEffects = this.settings.lowEffects;
    this.camX = world.player.x - this.vw / 2;
    this.camY = world.player.y - this.vh / 2;
  }

  shake(a: number): void {
    if (this.settings.reducedShake) a *= 0.25;
    this.shakeAmt = Math.min(8, Math.max(this.shakeAmt, a));
  }

  update(dt: number, world: World): void {
    this.time += dt;
    this.particles.update(dt);
    const p = world.player;
    const look = 10;
    const tx = p.x + Math.cos(p.face) * look - this.vw / 2;
    const ty = p.y - 8 + Math.sin(p.face) * look * 0.7 - this.vh / 2;
    const k = damp(7, dt);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    const mw = world.map.w * TILE;
    const mh = world.map.h * TILE;
    if (mw > this.vw) this.camX = Math.max(0, Math.min(mw - this.vw, this.camX));
    else this.camX = (mw - this.vw) / 2;
    if (mh > this.vh) this.camY = Math.max(0, Math.min(mh - this.vh, this.camY));
    else this.camY = (mh - this.vh) / 2;
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 22);
    this.shakeX = (Math.random() - 0.5) * this.shakeAmt;
    this.shakeY = (Math.random() - 0.5) * this.shakeAmt;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);

    // Ambient particles.
    if (this.vis && !this.settings.lowEffects) {
      for (const b of this.vis.beams) {
        if (Math.random() < dt * 3 && this.onScreen(b.x, b.y + b.len / 2, b.len)) {
          const t = Math.random();
          this.particles.ambient(b.x + b.len * 0.35 * t + Math.random() * b.w, b.y + b.len * t, 'mote');
        }
      }
      if (Math.random() < dt * 2) {
        this.particles.ambient(this.camX + Math.random() * this.vw, this.camY + Math.random() * this.vh, 'firefly');
      }
    }
    if (world.stairsOpen && Math.random() < dt * 6) {
      const s = world.stairsCenter();
      this.particles.ambient(s.x - 12 + Math.random() * 24, s.y + 4, 'stair');
    }
  }

  private onScreen(x: number, y: number, pad = 32): boolean {
    return x > this.camX - pad && x < this.camX + this.vw + pad && y > this.camY - pad && y < this.camY + this.vh + pad;
  }

  render(world: World): void {
    const g = this.g;
    const vis = this.vis!;
    const cx = Math.round(this.camX + this.shakeX);
    const cy = Math.round(this.camY + this.shakeY);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.theme.void[0];
    g.fillRect(0, 0, this.vw, this.vh);
    g.setTransform(1, 0, 0, 1, -cx, -cy);

    // Static ground.
    g.drawImage(vis.ground, cx, cy, this.vw, this.vh, cx, cy, this.vw, this.vh);
    this.drawWater(g, world);
    if (world.stairsOpen) this.drawStairs(g, world);
    this.drawTelegraphs(g, world);

    // Shadows.
    g.fillStyle = 'rgba(10, 16, 8, 0.35)';
    const shadow = (x: number, y: number, rx: number) => {
      g.beginPath();
      g.ellipse(Math.round(x), Math.round(y), rx, Math.max(1.5, rx * 0.45), 0, 0, Math.PI * 2);
      g.fill();
    };
    const p = world.player;
    if (p.state !== 'dead' && !this.hidePlayer) shadow(p.x, p.y + 1, 5);
    for (const e of world.enemies) if (e.state !== 'dead') shadow(e.x, e.y + 1, e.r + (e.boss ? 4 : 0));
    for (const k of world.pickups) shadow(k.x, k.y + 1, k.kind === 'item' ? 4 : 2);

    // Y-sorted drawables.
    const items: { y: number; draw: () => void }[] = [];
    for (const t of vis.tall) if (this.onScreen(t.x, t.y, 40)) items.push({ y: t.y, draw: () => g.drawImage(t.img, Math.round(t.x + t.ox), Math.round(t.y + t.oy)) });
    const props = propSprites();
    for (const c of world.chests) {
      if (!this.onScreen(c.x, c.y)) continue;
      items.push({
        y: c.y + 4,
        draw: () => {
          const img = c.opened ? props.chestOpen : c.guarded ? props.chestGuarded : props.chestClosed;
          const bob = c.opened && c.t < 0.2 ? -2 : 0;
          g.drawImage(img, Math.round(c.x - 8), Math.round(c.y - 9 + bob));
          if (!c.opened && Math.sin(this.time * 3 + c.id) > 0.92) this.particles.burst('sparkle', c.x + (Math.random() - 0.5) * 10, c.y - 8);
        },
      });
    }
    for (const s of world.springs) {
      items.push({ y: s.y - 2, draw: () => g.drawImage(s.used ? props.springUsed : props.spring, Math.round(s.x - 12), Math.round(s.y - 10)) });
    }
    for (const k of world.pickups) {
      if (!this.onScreen(k.x, k.y)) continue;
      items.push({ y: k.y, draw: () => this.drawPickup(g, k) });
    }
    for (const gate of world.gates) {
      items.push({ y: gate.y * TILE + 15, draw: () => g.drawImage(props.gate, gate.x * TILE, gate.y * TILE - 8) });
    }
    for (const e of world.enemies) {
      if (!this.onScreen(e.x, e.y, 60)) continue;
      items.push({ y: e.y, draw: () => (e.boss ? this.drawBoss(g, e, world) : this.drawEnemy(g, e)) });
    }
    if (!this.hidePlayer && (p.state !== 'dead' || p.stateT < 0.6)) items.push({ y: p.y, draw: () => this.drawPlayer(g, world) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    // Projectiles.
    for (const pr of world.projectiles) {
      if (pr.kind === 'seed') {
        const img = props.seed;
        g.drawImage(img, Math.round(pr.x - 4), Math.round(pr.y - 4));
        g.fillStyle = 'rgba(156, 240, 90, 0.35)';
        g.fillRect(Math.round(pr.x - pr.vx * 0.03), Math.round(pr.y - pr.vy * 0.03), 2, 2);
      } else this.drawCrescent(g, pr.x, pr.y, Math.atan2(pr.vy, pr.vx), pr.weapon?.item.element ?? 'none', pr.life);
    }

    this.particles.draw(g, false);
    this.drawLighting(g, world);
    g.globalCompositeOperation = 'lighter';
    this.particles.draw(g, true);
    g.globalCompositeOperation = 'source-over';

    this.drawOverheads(g, world);
    this.drawNumbers(g);
    this.drawInteractMarker(g, world);

    g.setTransform(1, 0, 0, 1, 0, 0);
    this.drawVignette(g);
    if (this.hurtFlash > 0 && !this.settings.reducedFlashes) {
      const grd = g.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.3, this.vw / 2, this.vh / 2, this.vh * 0.85);
      grd.addColorStop(0, 'rgba(180, 20, 20, 0)');
      grd.addColorStop(1, `rgba(180, 20, 20, ${0.45 * this.hurtFlash})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, this.vw, this.vh);
    }
    const dying = p.state === 'dead' && !this.hidePlayer ? Math.min(1, p.stateT / 1.2) : 0;
    if (dying > 0) {
      g.fillStyle = `rgba(10, 4, 6, ${dying * 0.6})`;
      g.fillRect(0, 0, this.vw, this.vh);
    }

    this.sg.imageSmoothingEnabled = false;
    this.sg.drawImage(this.low, 0, 0, this.screen.width, this.screen.height);
  }

  // ---------------------------------------------------------------------------

  private drawWater(g: CanvasRenderingContext2D, world: World) {
    const vis = this.vis!;
    const t = this.time;
    for (const w of vis.water) {
      const x = w.x * TILE;
      const y = w.y * TILE;
      if (!this.onScreen(x, y, 16)) continue;
      // Drifting highlight lines and twinkles (cosmetic only).
      for (let i = 0; i < 3; i++) {
        const h = hash2(w.x * 3 + i, w.y, 77);
        const ph = (t * (0.4 + h * 0.4) + h * 10) % 1;
        const lx = x + Math.floor(h * 13);
        const ly = y + Math.floor(((h * 7 + ph * 16) % 16));
        const a = Math.sin(ph * Math.PI) * 0.45;
        g.fillStyle = `rgba(180, 250, 240, ${a})`;
        g.fillRect(lx, ly, 2 + Math.floor(h * 3), 1);
      }
      const tw = hash2(w.x, w.y, Math.floor(t * 2));
      if (tw > 0.82) {
        g.fillStyle = 'rgba(240, 255, 250, 0.85)';
        g.fillRect(x + Math.floor(tw * 97) % 16, y + Math.floor(tw * 61) % 16, 1, 1);
      }
    }
    void world;
  }

  private drawStairs(g: CanvasRenderingContext2D, world: World) {
    const vis = this.vis!;
    const x = world.plan.exit.x * TILE;
    const y = world.plan.exit.y * TILE;
    g.drawImage(vis.stairs, x, y);
    // Pulse to make the exit readable from a distance.
    const a = 0.25 + Math.sin(this.time * 2.5) * 0.12;
    g.globalCompositeOperation = 'lighter';
    const grd = g.createRadialGradient(x + 16, y + 22, 2, x + 16, y + 22, 26);
    grd.addColorStop(0, `rgba(255, 200, 110, ${a})`);
    grd.addColorStop(1, 'rgba(255, 200, 110, 0)');
    g.fillStyle = grd;
    g.fillRect(x - 12, y - 6, 56, 56);
    g.globalCompositeOperation = 'source-over';
    if (world.descendHold > 0) {
      const t = world.descendHold / 0.7;
      g.strokeStyle = 'rgba(255, 230, 160, 0.9)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(world.player.x, world.player.y - 24, 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      g.stroke();
    }
  }

  private drawTelegraphs(g: CanvasRenderingContext2D, world: World) {
    const p = world.player;
    for (const e of world.enemies) {
      if (e.state !== 'windup' && !(e.state === 'active' && e.boss)) continue;
      if (e.boss) {
        this.drawBossTelegraph(g, e, world);
        continue;
      }
      const atk = e.def!.attack;
      const frenzy = e.mutation === 'frenzied' ? 0.75 : 1;
      const prog = Math.min(1, e.t / (atk.windup * frenzy));
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 20);
      if (atk.kind === 'slam') {
        this.telegraphCircle(g, e.ax, e.ay, atk.size, prog, pulse);
      } else if (atk.kind === 'lunge') {
        const len = atk.size * atk.active + 6;
        this.telegraphLine(g, e.x, e.y, e.aim, len, e.r * 2 + 2, prog, pulse);
      } else {
        // Ranged: thin aim line toward the player — never a silent projectile.
        const len = Math.min(180, Math.hypot(p.x - e.x, p.y - e.y) + 20);
        this.telegraphLine(g, e.x, e.y - 6, e.aim, len, 3, prog, pulse);
      }
    }
    for (const h of world.hazards) {
      if (h.warn > 0) {
        const prog = 1 - h.warn / h.warnTotal;
        if (h.kind === 'sporeCloud') {
          g.strokeStyle = `rgba(156, 240, 90, ${0.5 + prog * 0.4})`;
          g.fillStyle = `rgba(156, 240, 90, ${0.1 + prog * 0.2})`;
          g.lineWidth = 1;
          g.beginPath();
          g.ellipse(h.x, h.y, h.r, h.r * 0.75, 0, 0, Math.PI * 2);
          g.fill();
          g.stroke();
        } else this.telegraphCircle(g, h.x, h.y, h.r, prog, 0.5 + 0.5 * Math.sin(this.time * 20));
      } else if (h.kind === 'eruption') {
        this.drawThorns(g, h.x, h.y, h.r, h.active / 0.3);
      } else {
        g.fillStyle = `rgba(120, 220, 80, ${h.active * 0.8})`;
        g.beginPath();
        g.ellipse(h.x, h.y, h.r, h.r * 0.75, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  private telegraphCircle(g: CanvasRenderingContext2D, x: number, y: number, r: number, prog: number, pulse: number) {
    g.fillStyle = `rgba(${TELEGRAPH}, ${0.1 + prog * 0.18})`;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
    // Inner fill grows to show timing.
    g.fillStyle = `rgba(${TELEGRAPH_HOT}, ${0.25 + prog * 0.2})`;
    g.beginPath();
    g.ellipse(x, y, r * prog, r * 0.8 * prog, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `rgba(${TELEGRAPH}, ${0.65 + pulse * 0.3 * prog})`;
    g.lineWidth = 1;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    g.stroke();
  }

  private telegraphLine(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, w: number, prog: number, pulse: number) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    g.fillStyle = `rgba(${TELEGRAPH}, ${0.12 + prog * 0.15})`;
    g.fillRect(0, -w / 2, len, w);
    g.fillStyle = `rgba(${TELEGRAPH_HOT}, ${0.3 + prog * 0.25})`;
    g.fillRect(0, -w / 2, len * prog, w);
    g.strokeStyle = `rgba(${TELEGRAPH}, ${0.6 + pulse * 0.3 * prog})`;
    g.lineWidth = 1;
    g.strokeRect(0.5, -w / 2, len, w);
    // Chevrons
    g.fillStyle = `rgba(255, 230, 170, ${0.5 * prog})`;
    for (let d = 12; d < len - 4; d += 14) {
      g.fillRect(d, -1, 2, 2);
      g.fillRect(d - 1, -2, 1, 1);
      g.fillRect(d - 1, 1, 1, 1);
    }
    g.restore();
  }

  private drawBossTelegraph(g: CanvasRenderingContext2D, e: Enemy, world: World) {
    const b = e.boss!;
    if (e.state !== 'windup') return;
    const total = b.move === 'sweep' ? (b.phase === 2 ? 0.7 : 0.85) : b.move === 'charge' ? (b.phase === 2 ? 0.8 : 0.95) : b.move === 'erupt' ? (b.phase === 2 ? 0.95 : 1.1) : 1.2;
    const prog = Math.min(1, e.t / (total * (b.chill > 0 ? 1.35 : 1)));
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 20);
    if (b.move === 'sweep') {
      const r = 52;
      const half = (200 * Math.PI) / 360;
      g.fillStyle = `rgba(${TELEGRAPH}, ${0.1 + prog * 0.18})`;
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.arc(e.x, e.y, r, e.aim - half, e.aim + half);
      g.closePath();
      g.fill();
      g.fillStyle = `rgba(${TELEGRAPH_HOT}, ${0.25 + prog * 0.2})`;
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.arc(e.x, e.y, r * prog, e.aim - half, e.aim + half);
      g.closePath();
      g.fill();
      g.strokeStyle = `rgba(${TELEGRAPH}, ${0.7 + pulse * 0.3})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.arc(e.x, e.y, r, e.aim - half, e.aim + half);
      g.closePath();
      g.stroke();
    } else if (b.move === 'charge') {
      this.telegraphLine(g, e.x, e.y, e.aim, b.chargeLen + 20, 26, prog, pulse);
    } else if (b.move === 'erupt') {
      for (const m of b.marks) this.telegraphCircle(g, m.x, m.y, 15, prog, pulse);
    }
    void world;
  }

  private drawThorns(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + x;
      const d = (i % 2 ? 0.3 : 0.65) * r;
      const bx = Math.round(x + Math.cos(a) * d);
      const by = Math.round(y + Math.sin(a) * d * 0.75);
      const h = Math.round((6 + (i % 3) * 3) * Math.min(1, t * 2));
      g.fillStyle = '#5a3a22';
      g.fillRect(bx - 1, by - h, 3, h);
      g.fillStyle = '#8a5a34';
      g.fillRect(bx - 1, by - h, 1, h);
      g.fillStyle = '#d8584a';
      g.fillRect(bx, by - h - 1, 1, 2);
    }
  }

  private drawPickup(g: CanvasRenderingContext2D, k: World['pickups'][number]) {
    const props = propSprites();
    const y = Math.round(k.y - k.z);
    if (k.kind === 'gold') {
      const f = Math.floor(this.time * 8 + k.id) % 4;
      g.drawImage(props.coin[f], Math.round(k.x - 3), y - 5);
    } else if (k.kind === 'orb') {
      const bob = Math.round(Math.sin(this.time * 4 + k.id) * 1.5);
      g.drawImage(props.orb, Math.round(k.x - 4), y - 9 + bob);
    } else if (k.item) {
      const bob = Math.round(Math.sin(this.time * 3 + k.id) * 1.5);
      // Rarity beam so items read from afar.
      const col = rarityRGB(k.item.rarity);
      g.globalCompositeOperation = 'lighter';
      const grd = g.createLinearGradient(0, y - 30, 0, y);
      grd.addColorStop(0, `rgba(${col}, 0)`);
      grd.addColorStop(1, `rgba(${col}, 0.35)`);
      g.fillStyle = grd;
      g.fillRect(Math.round(k.x - 3), y - 30, 6, 30);
      g.globalCompositeOperation = 'source-over';
      const icon = iconSmall(k.item);
      g.drawImage(icon, Math.round(k.x - 8), y - 18 + bob);
    }
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy) {
    const s = enemySprites(e.kind, e.elite);
    let img: HTMLCanvasElement;
    let wIdx: number;
    if (e.state === 'windup') {
      img = s.windup;
      wIdx = s.frames.length;
    } else if (e.state === 'active' || e.state === 'stagger') {
      img = s.attack;
      wIdx = s.frames.length + 1;
    } else {
      const speed = e.kind === 'moth' ? 10 : 6;
      const f = Math.floor(e.anim * speed) % s.frames.length;
      img = s.frames[f];
      wIdx = f;
    }
    const frozen = e.frost.active > 0;
    if (frozen) {
      img = s.frames[0];
      wIdx = 0;
    }
    const shakeX = e.state === 'windup' ? Math.round(Math.sin(this.time * 60) * 0.6) : 0;
    const bob = e.kind === 'moth' ? Math.round(Math.sin(e.anim * 4) * 2) : 0;
    const x = Math.round(e.x + s.ox + shakeX);
    const y = Math.round(e.y + s.oy + bob);
    const dead = e.state === 'dead';
    if (dead) g.globalAlpha = Math.max(0, 1 - e.deadT / 0.6);
    g.save();
    if (e.facing < 0) {
      g.translate(x + s.w, y);
      g.scale(-1, 1);
      g.drawImage(img, 0, 0);
      if (e.flash > 0) g.drawImage(s.white[wIdx], 0, 0);
    } else {
      g.drawImage(img, x, y);
      if (e.flash > 0) g.drawImage(s.white[wIdx], x, y);
    }
    g.restore();
    if (e.poison.active > 0 && Math.random() < 0.15) this.particles.burst('poisonTick', e.x, e.y - 8, 0, 0.4);
    if (frozen) this.drawIce(g, e.x, e.y, e.r);
    g.globalAlpha = 1;
  }

  private drawIce(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
    const w = Math.round(r * 2 + 6);
    const h = Math.round(r * 2 + 8);
    const lx = Math.round(x - w / 2);
    const ly = Math.round(y - h + 2);
    g.fillStyle = 'rgba(160, 230, 255, 0.45)';
    g.fillRect(lx + 1, ly, w - 2, h);
    g.fillRect(lx, ly + 2, w, h - 4);
    g.fillStyle = 'rgba(230, 250, 255, 0.85)';
    g.fillRect(lx + 2, ly + 1, w - 6, 1);
    g.fillRect(lx + 1, ly + 2, 1, h - 6);
    g.fillRect(lx + w - 4, ly + 4, 1, 3);
    g.fillStyle = 'rgba(80, 160, 210, 0.7)';
    g.fillRect(lx + 1, ly + h - 1, w - 2, 1);
    g.fillRect(lx + w - 1, ly + 2, 1, h - 4);
  }

  private drawBoss(g: CanvasRenderingContext2D, e: Enemy, world: World) {
    const b = e.boss!;
    const pose = b.stunned > 0 ? 'stun' : e.state === 'windup' ? 'windup' : e.state === 'active' ? 'attack' : 'idle';
    const frame = Math.floor(e.anim * 3) % 2;
    const img = wardenSprite(pose, b.phase, frame, b.stunned > 0);
    const x = Math.round(e.x - img.width / 2);
    const y = Math.round(e.y - img.height + 6 + (pose === 'idle' ? frame : 0));
    g.save();
    if (e.facing < 0) {
      g.translate(x + img.width, y);
      g.scale(-1, 1);
      g.drawImage(img, 0, 0);
    } else g.drawImage(img, x, y);
    g.restore();
    if (e.flash > 0) {
      g.globalAlpha = e.flash * 4;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(img, x, y);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    if (b.chill > 0) {
      g.fillStyle = `rgba(160, 230, 255, ${0.2 + Math.sin(this.time * 5) * 0.05})`;
      g.fillRect(x + 12, y + 20, img.width - 24, img.height - 22);
    }
    if (b.stunned > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.time * 4 + (i * Math.PI * 2) / 3;
        g.fillStyle = '#fff2a0';
        g.fillRect(Math.round(e.x + Math.cos(a) * 12), Math.round(y + 2 + Math.sin(a) * 3), 2, 2);
      }
    }
    if (!b.awake && world.bossFight === 'none') {
      // Dormant: slumped, with drifting leaves.
      if (Math.random() < 0.03) this.particles.burst('leaves', e.x + (Math.random() - 0.5) * 30, e.y - 40, Math.PI / 2, 0.3);
    }
  }

  private drawPlayer(g: CanvasRenderingContext2D, world: World) {
    const p = world.player;
    const look = playerLook(world);
    const fr = playerFrames(look);
    const dir = p.dir4;
    const walkF = p.moving ? Math.floor(p.walkT * 9) % 4 : 0;
    const img = fr.frames[dir][walkF];
    const bob = p.moving && walkF % 2 === 1 ? -1 : 0;
    const blink = p.hurtT > 0 && Math.floor(p.hurtT * 20) % 2 === 0;
    const x = Math.round(p.x - 8);
    const y = Math.round(p.y - 17 + bob);
    const ws = weaponStats(p);
    const weaponBehind = dir === 1;
    if (ws && weaponBehind) this.drawWeapon(g, world);
    if (p.state === 'dead') {
      g.globalAlpha = Math.max(0, 1 - p.stateT / 0.6);
    }
    if (p.state === 'dodge') {
      // Roll: rotate through a full turn with afterimages.
      const t = p.stateT / 0.3;
      const ang = t * Math.PI * 2 * (p.dodgeDx >= 0 ? 1 : -1);
      for (let i = 2; i >= 1; i--) {
        g.globalAlpha = 0.18 * i;
        g.drawImage(fr.white[dir][0], Math.round(x - p.dodgeDx * i * 5), Math.round(y - p.dodgeDy * i * 5));
      }
      g.globalAlpha = 1;
      g.save();
      g.translate(Math.round(p.x), Math.round(p.y - 8));
      g.rotate(ang);
      g.drawImage(img, -8, -9);
      g.restore();
    } else {
      if (!blink) g.drawImage(img, x, y);
      else {
        g.globalAlpha = 0.5;
        g.drawImage(img, x, y);
        g.globalAlpha = 1;
      }
      if (p.flash > 0) {
        g.globalAlpha = p.flash * 4;
        g.drawImage(fr.white[dir][walkF], x, y);
        g.globalAlpha = 1;
      }
    }
    if (p.state === 'flask') {
      g.fillStyle = '#ff6a6a';
      g.fillRect(Math.round(p.x + 3), Math.round(p.y - 11), 2, 3);
      g.fillStyle = '#ffe0e0';
      g.fillRect(Math.round(p.x + 3), Math.round(p.y - 12), 2, 1);
    }
    g.globalAlpha = 1;
    if (ws && !weaponBehind && p.state !== 'dodge') this.drawWeapon(g, world);
    if (p.echoArmed || p.echoPending) {
      g.globalAlpha = 0.35 + Math.sin(this.time * 10) * 0.15;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(fr.white[dir][0], x + 2, y);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
  }

  private drawWeapon(g: CanvasRenderingContext2D, world: World) {
    const p = world.player;
    const ws = weaponStats(p)!;
    const fam = FAMILIES[ws.family];
    const held = heldWeapon(ws.item);
    let angle: number;
    let trail: { from: number; to: number; reach: number; alpha: number } | null = null;
    const hx = p.x;
    const hy = p.y - 7;
    if (p.state === 'attack') {
      const s = fam.combo[p.atkStep];
      const start = p.atkDir - (s.arc / 2) * s.sweep;
      const end = p.atkDir + (s.arc / 2) * s.sweep;
      if (p.atkPhase === 'windup') {
        const t = p.atkT / s.windup;
        angle = start - 0.35 * s.sweep * t;
      } else if (p.atkPhase === 'active') {
        const t = Math.min(1, p.atkT / s.active);
        angle = start + (end - start) * t;
        trail = { from: start, to: angle, reach: s.reach * ws.reachMul, alpha: 1 };
      } else {
        angle = end;
        const t = p.atkT / s.recovery;
        if (t < 0.5) trail = { from: start, to: end, reach: s.reach * ws.reachMul, alpha: 1 - t * 2 };
      }
    } else if (p.state === 'skill') {
      angle = p.skillDir + (p.skillId === 'fracture' ? (p.stateT < 0.42 ? -1.6 : 0.3) : 0);
      if (p.skillId === 'fracture' && p.stateT < 0.42) angle = p.skillDir - 1.6 + (p.stateT / 0.42) * 0.2;
    } else {
      // Resting pose by facing direction.
      angle = p.dir4 === 0 ? 1.9 : p.dir4 === 1 ? -1.2 : p.dir4 === 2 ? 2.4 : 0.75;
    }
    if (trail) this.drawSwingTrail(g, hx, hy, trail.from, trail.to, trail.reach, ws.item.element, trail.alpha, ws.heavy);
    g.save();
    const off = p.state === 'free' || p.state === 'flask' ? 4 : 2;
    g.translate(Math.round(hx + Math.cos(angle) * off), Math.round(hy + 2 + Math.sin(angle) * off));
    g.rotate(angle);
    g.drawImage(held.img, -held.gx, -held.gy);
    g.restore();
  }

  private drawSwingTrail(g: CanvasRenderingContext2D, x: number, y: number, from: number, to: number, reach: number, el: string, alpha: number, heavy: boolean) {
    const glow = elementGlow(el as never);
    const steps = 10;
    g.save();
    g.globalAlpha = alpha * 0.9;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const a = from + (to - from) * t0;
      const r1 = reach * 0.45;
      const r2 = reach * (0.82 + 0.18 * t0);
      const w = heavy ? 3 : 2;
      g.strokeStyle = i > steps * 0.6 ? '#ffffff' : glow;
      g.globalAlpha = alpha * (0.25 + t0 * 0.75);
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1 * 0.85);
      g.lineTo(x + Math.cos(a) * r2, y + Math.sin(a) * r2 * 0.85);
      g.stroke();
    }
    g.restore();
  }

  private drawCrescent(g: CanvasRenderingContext2D, x: number, y: number, a: number, el: string, life: number) {
    const glow = elementGlow(el as never);
    g.save();
    g.translate(Math.round(x), Math.round(y));
    g.rotate(a);
    g.globalAlpha = Math.min(1, life * 3);
    g.strokeStyle = glow;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(-6, 0, 10, -1.1, 1.1);
    g.stroke();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.beginPath();
    g.arc(-5, 0, 10, -0.9, 0.9);
    g.stroke();
    g.restore();
  }

  private drawLighting(g: CanvasRenderingContext2D, world: World) {
    const vis = this.vis!;
    const t = this.time;
    g.globalCompositeOperation = 'lighter';
    // Sunbeams: slanted shafts, slowly breathing.
    for (const b of vis.beams) {
      if (!this.onScreen(b.x, b.y + b.len / 2, b.len)) continue;
      const a = 0.07 + Math.sin(t * 0.5 + b.phase) * 0.025;
      const slant = b.len * 0.35;
      const grd = g.createLinearGradient(b.x, b.y, b.x + slant, b.y + b.len);
      grd.addColorStop(0, `rgba(${this.theme.beamColor}, ${a * 1.6})`);
      grd.addColorStop(0.7, `rgba(${this.theme.beamColor}, ${a})`);
      grd.addColorStop(1, `rgba(${this.theme.beamColor}, 0)`);
      g.fillStyle = grd;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x + b.w, b.y);
      g.lineTo(b.x + b.w + slant, b.y + b.len);
      g.lineTo(b.x + slant, b.y + b.len);
      g.closePath();
      g.fill();
    }
    // Torches.
    for (const tc of vis.torches) {
      if (!this.onScreen(tc.x, tc.y, 40)) continue;
      const fl = 0.8 + Math.sin(t * 9 + tc.phase) * 0.1 + Math.sin(t * 23 + tc.phase) * 0.05;
      const r = 34 * fl;
      const grd = g.createRadialGradient(tc.x, tc.y, 1, tc.x, tc.y + 6, r);
      grd.addColorStop(0, `rgba(${this.theme.torchColor}, 0.38)`);
      grd.addColorStop(1, `rgba(${this.theme.torchColor}, 0)`);
      g.fillStyle = grd;
      g.fillRect(tc.x - r, tc.y - r, r * 2, r * 2 + 12);
    }
    g.globalCompositeOperation = 'source-over';
    for (const tc of vis.torches) {
      if (!this.onScreen(tc.x, tc.y, 20)) continue;
      const f = Math.floor(t * 10 + tc.phase) % 3;
      g.fillStyle = '#ff9a3a';
      g.fillRect(tc.x - 1, tc.y - 3 - f, 3, 3 + f);
      g.fillStyle = '#ffe07a';
      g.fillRect(tc.x, tc.y - 2 - (f % 2), 1, 2);
    }
    // Player's weapon element glow so magic reads clearly.
    const ws = weaponStats(world.player);
    if (ws && ws.item.element !== 'none' && world.player.state !== 'dead') {
      g.globalCompositeOperation = 'lighter';
      const col = ws.item.element === 'frost' ? '120, 210, 255' : '140, 240, 90';
      const grd = g.createRadialGradient(world.player.x, world.player.y - 6, 0, world.player.x, world.player.y - 6, 18);
      grd.addColorStop(0, `rgba(${col}, 0.12)`);
      grd.addColorStop(1, `rgba(${col}, 0)`);
      g.fillStyle = grd;
      g.fillRect(world.player.x - 18, world.player.y - 24, 36, 36);
      g.globalCompositeOperation = 'source-over';
    }
  }

  private drawOverheads(g: CanvasRenderingContext2D, world: World) {
    for (const e of world.enemies) {
      if (e.state === 'dead' || e.boss) continue;
      if (!e.aggro && e.hp >= e.maxHp && e.poison.build <= 0 && e.frost.build <= 0) continue;
      const s = enemySprites(e.kind, e.elite);
      const w = e.elite ? 18 : 14;
      const x = Math.round(e.x - w / 2);
      const y = Math.round(e.y + s.oy - 4 + (e.kind === 'moth' ? 2 : 4));
      g.fillStyle = '#140e14';
      g.fillRect(x - 1, y - 1, w + 2, 4);
      g.fillStyle = '#3a1a1a';
      g.fillRect(x, y, w, 2);
      g.fillStyle = e.elite ? '#ff8a3a' : '#e04a3a';
      g.fillRect(x, y, Math.max(0, Math.round((w * e.hp) / e.maxHp)), 2);
      if (e.elite) {
        g.fillStyle = '#ffd25a';
        g.fillRect(x - 3, y - 1, 2, 2);
        g.fillRect(x - 4, y - 2, 1, 1);
        g.fillRect(x - 2, y - 2, 1, 1);
      }
      // Status meters (buildup is a meter, never a number).
      let my = y + 3;
      for (const kind of ['poison', 'frost'] as const) {
        const st = e[kind];
        if (st.build <= 0 && st.active <= 0) continue;
        const col = kind === 'poison' ? '#9cf05a' : '#9ae8ff';
        const thr = e.resistBase[kind] * st.resist;
        const fill = st.active > 0 ? 1 : st.build / thr;
        g.fillStyle = '#140e14';
        g.fillRect(x - 1, my, w + 2, 3);
        g.fillStyle = st.active > 0 && Math.floor(this.time * 6) % 2 ? '#ffffff' : col;
        g.fillRect(x, my + 1, Math.round(w * Math.min(1, fill)), 1);
        // Icon: droplet / snowflake glyph.
        g.fillStyle = col;
        if (kind === 'poison') {
          g.fillRect(x + w + 2, my, 1, 1);
          g.fillRect(x + w + 1, my + 1, 3, 2);
        } else {
          g.fillRect(x + w + 2, my, 1, 3);
          g.fillRect(x + w + 1, my + 1, 3, 1);
        }
        my += 3;
      }
    }
    const p = world.player;
    if (p.poison.build > 0 && p.poison.active <= 0) {
      const x = Math.round(p.x - 7);
      const y = Math.round(p.y - 22);
      g.fillStyle = '#140e14';
      g.fillRect(x - 1, y, 16, 3);
      g.fillStyle = '#9cf05a';
      g.fillRect(x, y + 1, Math.round(14 * Math.min(1, p.poison.build / 100)), 1);
    }
  }

  private drawNumbers(g: CanvasRenderingContext2D) {
    for (const n of this.particles.numbers) {
      const big = n.kind === 'crit' || n.kind === 'shatter';
      const col =
        n.kind === 'crit'
          ? '#ffd84a'
          : n.kind === 'hurt'
            ? '#ff5a4a'
            : n.kind === 'heal'
              ? '#7aff9a'
              : n.kind === 'poison'
                ? '#9cf05a'
                : n.kind === 'shatter'
                  ? '#9ae8ff'
                  : '#ffffff';
      const text = n.kind === 'crit' ? `${n.text}!` : n.text;
      g.globalAlpha = Math.min(1, n.life * 4);
      drawText(g, text, n.x - textWidth(text, big) / 2, n.y - (big ? 7 : 5), col, big);
      g.globalAlpha = 1;
    }
  }

  private drawInteractMarker(g: CanvasRenderingContext2D, world: World) {
    const n = world.nearby;
    if (!n) return;
    let x = world.player.x;
    let y = world.player.y - 28;
    if (n.kind === 'chest') {
      x = n.chest.x;
      y = n.chest.y - 16;
    } else if (n.kind === 'item') {
      x = n.pickup.x;
      y = n.pickup.y - 26;
    } else if (n.kind === 'spring') {
      x = n.spring.x;
      y = n.spring.y - 16;
    } else {
      const s = world.stairsCenter();
      x = s.x;
      y = s.y - 22;
    }
    const b = Math.round(Math.sin(this.time * 6) * 1.5);
    g.fillStyle = '#140e14';
    g.fillRect(Math.round(x) - 3, Math.round(y) + b - 1, 7, 5);
    g.fillStyle = '#ffe9a8';
    g.fillRect(Math.round(x) - 2, Math.round(y) + b, 5, 1);
    g.fillRect(Math.round(x) - 1, Math.round(y) + b + 1, 3, 1);
    g.fillRect(Math.round(x), Math.round(y) + b + 2, 1, 1);
  }

  private vignetteCache: { w: number; h: number; c: HTMLCanvasElement } | null = null;

  private drawVignette(g: CanvasRenderingContext2D) {
    if (!this.vignetteCache || this.vignetteCache.w !== this.vw || this.vignetteCache.h !== this.vh) {
      const c = canvas(this.vw, this.vh);
      const vg = ctx2d(c);
      const grd = vg.createRadialGradient(this.vw / 2, this.vh * 0.45, this.vh * 0.35, this.vw / 2, this.vh / 2, this.vh * 0.95);
      grd.addColorStop(0, 'rgba(8, 12, 6, 0)');
      grd.addColorStop(1, 'rgba(8, 12, 6, 0.55)');
      vg.fillStyle = grd;
      vg.fillRect(0, 0, this.vw, this.vh);
      // Warm wash from the upper-left (sun).
      const warm = vg.createLinearGradient(0, 0, this.vw, this.vh);
      warm.addColorStop(0, 'rgba(255, 220, 150, 0.08)');
      warm.addColorStop(0.5, 'rgba(255, 220, 150, 0)');
      vg.fillStyle = warm;
      vg.fillRect(0, 0, this.vw, this.vh);
      this.vignetteCache = { w: this.vw, h: this.vh, c };
    }
    g.drawImage(this.vignetteCache.c, 0, 0);
  }
}

export function rarityRGB(r: string): string {
  switch (r) {
    case 'uncommon':
      return '120, 220, 120';
    case 'rare':
      return '110, 170, 255';
    case 'epic':
      return '200, 120, 255';
    case 'mythic':
      return '255, 170, 60';
    default:
      return '220, 220, 210';
  }
}

const smallIcons = new Map<string, HTMLCanvasElement>();
import { itemIcon } from './icons';
function iconSmall(item: World['pickups'][number]['item'] & object): HTMLCanvasElement {
  const hit = smallIcons.get(item.uid);
  if (hit) return hit;
  const src = itemIcon(item);
  const c = canvas(16, 16);
  const g = ctx2d(c);
  // Downsample 2:1 with nearest neighbour so it stays crisp.
  g.drawImage(src, 0, 0, 16, 16);
  smallIcons.set(item.uid, c);
  return c;
}

export function playerLook(world: World): PlayerLook {
  const l = world.player.loadout;
  const look: PlayerLook = { ...DEFAULT_LOOK };
  if (l.chest) [look.tunic, look.tunicDark] = CHEST_LOOKS[l.chest.look % CHEST_LOOKS.length];
  if (l.boots) [look.boot, look.bootDark] = BOOT_LOOKS[l.boots.look % BOOT_LOOKS.length];
  return look;
}
