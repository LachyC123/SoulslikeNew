import { damp } from '../core/math';
import { hash2 } from '../core/rng';
import { MUTATIONS } from '../data/enemies';
import { EL_GLOW, EL_RGB, Element } from '../data/elements';
import { Item } from '../data/items';
import { Settings } from '../save/save';
import { weaponStats } from '../sim/player';
import { Ally, Enemy, Hazard, Projectile, World } from '../sim/world';
import { TILE } from '../world/tiles';
import { drawText, textWidth } from './font';
import { heldWeapon, itemIcon } from './icons';
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

  /** Called by the fx sink when an enemy dies: break its sprite into pixels. */
  deathOf(e: Enemy): void {
    if (e.boss) return;
    const s = enemySprites(e.kind, e.elite);
    const img = e.state === 'windup' ? s.windup : s.frames[0];
    const sc = e.scale;
    this.particles.disintegrate(img, e.x + s.ox * sc, e.y + s.oy * sc, e.facing < 0, sc);
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

    if (this.vis && !this.settings.lowEffects) {
      for (const b of this.vis.beams) {
        if (Math.random() < dt * 3 && this.onScreen(b.x, b.y + b.len / 2, b.len)) {
          const t = Math.random();
          this.particles.ambient(b.x + b.len * 0.35 * t + Math.random() * b.w, b.y + b.len * t, 'mote');
        }
      }
      if (Math.random() < dt * 2) this.particles.ambient(this.camX + Math.random() * this.vw, this.camY + Math.random() * this.vh, 'firefly');
      if (Math.random() < dt * 0.8) this.particles.ambient(this.camX + Math.random() * this.vw * 0.8, this.camY - 4, 'leafFall');
      if (Math.random() < dt * 0.3) this.particles.ambient(this.camX + Math.random() * this.vw, this.camY + this.vh * (0.3 + Math.random() * 0.5), 'butterfly');
    }
    if (world.stairsOpen && Math.random() < dt * 6) {
      const s = world.stairsCenter();
      this.particles.ambient(s.x - 12 + Math.random() * 24, s.y + 4, 'stair');
    }
    // Trails for projectiles and allies.
    for (const pr of world.projectiles) if (pr.owner === 'player' || pr.kind === 'firebolt') this.particles.trail(pr.x, pr.y, pr.el, pr.kind === 'orb' ? 2 : 1);
    for (const a of world.allies) if (a.kind !== 'decoy' && a.kind !== 'turret') this.particles.trail(a.x, a.y, a.el);
    // Burning foes shed embers.
    for (const e of world.enemies) {
      if (e.state === 'dead') continue;
      if (e.burn.active > 0 && Math.random() < dt * 14) this.particles.burst('burnTick', e.x + (Math.random() - 0.5) * e.r, e.y - 4, 0, 0.4);
      if (e.shock.active > 0 && Math.random() < dt * 6) this.particles.burst('shockTick', e.x, e.y - 6, 0, 0.6);
      if (e.poison.active > 0 && Math.random() < dt * 4) this.particles.burst('poisonTick', e.x, e.y - 8, 0, 0.4);
    }
    if (p.hasteT > 0 && p.moving && Math.random() < dt * 20) this.particles.burst('haste', p.x, p.y - 4, 0, 0.3);
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

    g.drawImage(vis.ground, cx, cy, this.vw, this.vh, cx, cy, this.vw, this.vh);
    this.drawWater(g);
    if (world.stairsOpen) this.drawStairs(g, world);
    this.drawGroundHazards(g, world);
    this.drawTelegraphs(g, world);

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
    for (const pr of world.projectiles) if (pr.kind === 'mortar') shadow(pr.tx!, pr.ty!, 4);

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
    for (const f of world.features) {
      if (!this.onScreen(f.x, f.y)) continue;
      items.push({ y: f.y - 2, draw: () => this.drawFeature(g, f) });
    }
    for (const k of world.pickups) {
      if (!this.onScreen(k.x, k.y)) continue;
      items.push({ y: k.y, draw: () => this.drawPickup(g, k) });
    }
    for (const gate of world.gates) items.push({ y: gate.y * TILE + 15, draw: () => g.drawImage(props.gate, gate.x * TILE, gate.y * TILE - 8) });
    for (const e of world.enemies) {
      if (!this.onScreen(e.x, e.y, 60)) continue;
      items.push({ y: e.y, draw: () => (e.boss ? this.drawBoss(g, e, world) : this.drawEnemy(g, e, world)) });
    }
    for (const a of world.allies) items.push({ y: a.y + (a.kind === 'wisp' || a.kind === 'spirit' || a.kind === 'orbit' ? 12 : 0), draw: () => this.drawAlly(g, a, world) });
    if (!this.hidePlayer && (p.state !== 'dead' || p.stateT < 0.6)) items.push({ y: p.y, draw: () => this.drawPlayer(g, world) });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) it.draw();

    for (const pr of world.projectiles) this.drawProjectile(g, pr);

    this.particles.draw(g, false);
    this.drawLighting(g, world);
    g.globalCompositeOperation = 'lighter';
    this.particles.draw(g, true);
    this.particles.drawBeams(g);
    g.globalCompositeOperation = 'source-over';

    this.drawOverheads(g, world);
    this.drawNumbers(g);
    this.drawInteractMarker(g, world);

    g.setTransform(1, 0, 0, 1, 0, 0);
    this.drawVignette(g);
    // Low health heartbeat.
    const low = !this.hidePlayer && p.state !== 'dead' && p.hp < p.build.maxHp * 0.3;
    if (low && !this.settings.reducedFlashes) {
      const beat = Math.pow(Math.max(0, Math.sin(this.time * 6.5)), 6);
      const grd = g.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.35, this.vw / 2, this.vh / 2, this.vh * 0.9);
      grd.addColorStop(0, 'rgba(160, 10, 20, 0)');
      grd.addColorStop(1, `rgba(160, 10, 20, ${0.18 + beat * 0.3})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, this.vw, this.vh);
    }
    if (this.hurtFlash > 0 && !this.settings.reducedFlashes) {
      const grd = g.createRadialGradient(this.vw / 2, this.vh / 2, this.vh * 0.3, this.vw / 2, this.vh / 2, this.vh * 0.85);
      grd.addColorStop(0, 'rgba(180, 20, 20, 0)');
      grd.addColorStop(1, `rgba(180, 20, 20, ${0.45 * this.hurtFlash})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, this.vw, this.vh);
    }
    if (world.slowT > 0) {
      g.fillStyle = `rgba(120, 100, 200, ${Math.min(0.18, world.slowT * 0.08)})`;
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

  private drawWater(g: CanvasRenderingContext2D) {
    const vis = this.vis!;
    const t = this.time;
    for (const w of vis.water) {
      const x = w.x * TILE;
      const y = w.y * TILE;
      if (!this.onScreen(x, y, 16)) continue;
      for (let i = 0; i < 3; i++) {
        const h = hash2(w.x * 3 + i, w.y, 77);
        const ph = (t * (0.4 + h * 0.4) + h * 10) % 1;
        const lx = x + Math.floor(h * 13);
        const ly = y + Math.floor((h * 7 + ph * 16) % 16);
        g.fillStyle = `rgba(180, 250, 240, ${Math.sin(ph * Math.PI) * 0.45})`;
        g.fillRect(lx, ly, 2 + Math.floor(h * 3), 1);
      }
      const tw = hash2(w.x, w.y, Math.floor(t * 2));
      if (tw > 0.82) {
        g.fillStyle = 'rgba(240, 255, 250, 0.85)';
        g.fillRect(x + (Math.floor(tw * 97) % 16), y + (Math.floor(tw * 61) % 16), 1, 1);
      }
    }
  }

  private drawStairs(g: CanvasRenderingContext2D, world: World) {
    const vis = this.vis!;
    const x = world.plan.exit.x * TILE;
    const y = world.plan.exit.y * TILE;
    g.drawImage(vis.stairs, x, y);
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

  private drawFeature(g: CanvasRenderingContext2D, f: World['features'][number]) {
    const props = propSprites();
    if (f.kind === 'spring') {
      g.drawImage(f.used ? props.springUsed : props.spring, Math.round(f.x - 12), Math.round(f.y - 10));
      return;
    }
    if (f.kind === 'shrine') {
      // Cursed shrine: dark obelisk with a pulsing violet heart.
      const x = Math.round(f.x);
      const y = Math.round(f.y);
      g.fillStyle = '#1c1820';
      g.fillRect(x - 6, y - 24, 12, 24);
      g.fillStyle = '#2e2836';
      g.fillRect(x - 5, y - 23, 10, 22);
      g.fillStyle = '#4a4058';
      g.fillRect(x - 5, y - 23, 2, 22);
      g.fillStyle = '#3a3044';
      g.fillRect(x - 8, y - 2, 16, 3);
      const pulse = 0.5 + Math.sin(this.time * 3) * 0.5;
      g.fillStyle = f.used ? '#3a3040' : `rgb(${180 + pulse * 60}, 80, ${200 + pulse * 40})`;
      g.fillRect(x - 2, y - 16, 4, 4);
      if (!f.used) {
        g.globalCompositeOperation = 'lighter';
        const grd = g.createRadialGradient(x, y - 14, 1, x, y - 14, 18);
        grd.addColorStop(0, `rgba(200, 90, 255, ${0.3 + pulse * 0.2})`);
        grd.addColorStop(1, 'rgba(200, 90, 255, 0)');
        g.fillStyle = grd;
        g.fillRect(x - 18, y - 32, 36, 36);
        g.globalCompositeOperation = 'source-over';
        if (Math.random() < 0.1) this.particles.burst('blink', x + (Math.random() - 0.5) * 10, y - 14, 0, 0.3);
      }
      return;
    }
    // Merchant: a hooded figure beside a rug of wares and a lantern.
    const x = Math.round(f.x);
    const y = Math.round(f.y);
    g.fillStyle = '#7a2a2a';
    g.fillRect(x - 14, y - 2, 28, 7);
    g.fillStyle = '#c8a050';
    for (let i = 0; i < 7; i++) g.fillRect(x - 13 + i * 4, y, 2, 1);
    g.fillStyle = '#2a3a4a';
    g.fillRect(x - 5, y - 16, 10, 14);
    g.fillStyle = '#3a4e62';
    g.fillRect(x - 4, y - 15, 3, 12);
    g.fillStyle = '#1a2430';
    g.fillRect(x - 4, y - 21, 8, 6);
    g.fillStyle = '#f4cba3';
    g.fillRect(x - 2, y - 18, 4, 2);
    g.fillStyle = '#ffe07a';
    g.fillRect(x + 8, y - 10, 3, 4);
    const items = ['#9ae8ff', '#ffae4a', '#9cf05a', '#e0b04a'];
    items.forEach((c, i) => {
      g.fillStyle = c;
      g.fillRect(x - 12 + i * 6, y + 1, 2, 2);
    });
    g.globalCompositeOperation = 'lighter';
    const grd = g.createRadialGradient(x + 9, y - 8, 1, x + 9, y - 8, 22);
    grd.addColorStop(0, `rgba(255, 200, 110, ${0.3 + Math.sin(this.time * 7) * 0.04})`);
    grd.addColorStop(1, 'rgba(255, 200, 110, 0)');
    g.fillStyle = grd;
    g.fillRect(x - 14, y - 30, 46, 46);
    g.globalCompositeOperation = 'source-over';
  }

  private drawGroundHazards(g: CanvasRenderingContext2D, world: World) {
    for (const h of world.hazards) {
      if (h.owner === 'player') this.drawPlayerHazard(g, h);
      else if (h.kind === 'puddle') {
        const a = Math.min(1, h.active / 0.6) * 0.45;
        g.fillStyle = `rgba(110, 200, 60, ${a})`;
        g.beginPath();
        g.ellipse(h.x, h.y, h.r, h.r * 0.7, 0, 0, Math.PI * 2);
        g.fill();
        if (Math.random() < 0.1) this.particles.burst('poisonTick', h.x + (Math.random() - 0.5) * h.r, h.y + (Math.random() - 0.5) * h.r * 0.6, 0, 0.4);
      }
    }
  }

  private drawPlayerHazard(g: CanvasRenderingContext2D, h: Hazard) {
    const rgb = EL_RGB[h.el];
    if (h.warn > 0) {
      // Friendly targeting uses the element colour, never amber.
      const prog = 1 - h.warn / h.warnTotal;
      g.strokeStyle = `rgba(${rgb}, ${0.5 + prog * 0.4})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(h.x, h.y, h.r * (1.2 - prog * 0.2), h.r * 0.8 * (1.2 - prog * 0.2), 0, 0, Math.PI * 2);
      g.stroke();
      if (h.kind === 'meteor') {
        const fy = h.y - 120 * (1 - prog);
        g.fillStyle = EL_GLOW[h.el];
        g.fillRect(Math.round(h.x - 2), Math.round(fy - 2), 4, 4);
        this.particles.trail(h.x, fy, h.el, 2);
      }
      return;
    }
    if (h.kind === 'vortex') {
      const t = this.time * 6;
      g.strokeStyle = `rgba(${rgb}, 0.7)`;
      g.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.ellipse(h.x, h.y, h.r * (0.4 + i * 0.25), h.r * 0.7 * (0.4 + i * 0.25), 0, t + i, t + i + 4);
        g.stroke();
      }
    } else if (h.kind === 'cloud') {
      g.fillStyle = `rgba(${rgb}, ${0.22 * Math.min(1, h.active)})`;
      g.beginPath();
      g.ellipse(h.x, h.y, h.r, h.r * 0.7, 0, 0, Math.PI * 2);
      g.fill();
      if (Math.random() < 0.3) this.particles.burst(h.el === 'burn' ? 'burnTick' : 'poisonTick', h.x + (Math.random() - 0.5) * h.r, h.y + (Math.random() - 0.5) * h.r * 0.6, 0, 0.5);
    }
  }

  private drawTelegraphs(g: CanvasRenderingContext2D, world: World) {
    const p = world.player;
    for (const e of world.enemies) {
      if (e.state !== 'windup' && !(e.state === 'active' && e.boss)) continue;
      if (e.boss) {
        this.drawBossTelegraph(g, e);
        continue;
      }
      const atk = e.def!.attack;
      const prog = Math.min(1, e.t / (atk.windup * e.windMul));
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 20);
      if (atk.kind === 'slam') this.telegraphCircle(g, e.ax, e.ay, atk.size * e.scale, prog, pulse);
      else if (atk.kind === 'lunge' || atk.kind === 'charge') this.telegraphLine(g, e.x, e.y, e.aim, atk.size * atk.active + 6, e.r * 2 + 2, prog, pulse);
      else if (atk.kind === 'thrust') this.telegraphLine(g, e.x, e.y, e.aim, atk.size, 12, prog, pulse);
      else if (atk.kind === 'shoot') {
        const len = Math.min(180, Math.hypot(p.x - e.x, p.y - e.y) + 20);
        const n = (atk.count ?? 1) + (e.elite ? 2 : 0);
        for (let i = 0; i < n; i++) this.telegraphLine(g, e.x, e.y - 6, e.aim + (n > 1 ? (i / (n - 1) - 0.5) * 0.5 : 0), len, 3, prog, pulse);
      }
    }
    for (const h of world.hazards) {
      if (h.owner !== 'enemy') continue;
      if (h.warn > 0) {
        const prog = 1 - h.warn / h.warnTotal;
        this.telegraphCircle(g, h.x, h.y, h.r, prog, 0.5 + 0.5 * Math.sin(this.time * 20));
      } else if (h.kind === 'eruption') this.drawThorns(g, h.x, h.y, h.r, h.active / 0.3);
    }
  }

  private telegraphCircle(g: CanvasRenderingContext2D, x: number, y: number, r: number, prog: number, pulse: number) {
    g.fillStyle = `rgba(${TELEGRAPH}, ${0.1 + prog * 0.18})`;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
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
    g.fillStyle = `rgba(255, 230, 170, ${0.5 * prog})`;
    for (let d = 12; d < len - 4; d += 14) {
      g.fillRect(d, -1, 2, 2);
      g.fillRect(d - 1, -2, 1, 1);
      g.fillRect(d - 1, 1, 1, 1);
    }
    g.restore();
  }

  private drawBossTelegraph(g: CanvasRenderingContext2D, e: Enemy) {
    const b = e.boss!;
    if (e.state !== 'windup') return;
    const total = b.move === 'sweep' ? (b.phase === 2 ? 0.62 : 0.75) : b.move === 'charge' ? (b.phase === 2 ? 0.7 : 0.85) : b.move === 'erupt' ? (b.phase === 2 ? 0.85 : 1) : 1.2;
    const prog = Math.min(1, e.t / (total * (b.chill > 0 ? 1.35 : 1)));
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 20);
    if (b.move === 'sweep') {
      const r = 54;
      const half = (210 * Math.PI) / 360;
      const wedge = (rr: number, fill: string) => {
        g.fillStyle = fill;
        g.beginPath();
        g.moveTo(e.x, e.y);
        g.arc(e.x, e.y, rr, e.aim - half, e.aim + half);
        g.closePath();
        g.fill();
      };
      wedge(r, `rgba(${TELEGRAPH}, ${0.1 + prog * 0.18})`);
      wedge(r * prog, `rgba(${TELEGRAPH_HOT}, ${0.25 + prog * 0.2})`);
      g.strokeStyle = `rgba(${TELEGRAPH}, ${0.7 + pulse * 0.3})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.arc(e.x, e.y, r, e.aim - half, e.aim + half);
      g.closePath();
      g.stroke();
    } else if (b.move === 'charge') this.telegraphLine(g, e.x, e.y, e.aim, b.chargeLen + 20, 26, prog, pulse);
    else if (b.move === 'erupt') for (const m of b.marks) this.telegraphCircle(g, m.x, m.y, 15, prog, pulse);
  }

  private drawThorns(g: CanvasRenderingContext2D, x: number, y: number, r: number, t: number) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + x;
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
      const col = rarityRGB(k.item.rarity);
      const tall = k.item.rarity === 'mythic' ? 60 : k.item.rarity === 'epic' ? 46 : 32;
      g.globalCompositeOperation = 'lighter';
      const grd = g.createLinearGradient(0, y - tall, 0, y);
      grd.addColorStop(0, `rgba(${col}, 0)`);
      grd.addColorStop(1, `rgba(${col}, ${0.3 + Math.sin(this.time * 4) * 0.08})`);
      g.fillStyle = grd;
      g.fillRect(Math.round(k.x - 3), y - tall, 6, tall);
      if (k.item.rarity === 'mythic' || k.item.rarity === 'epic') {
        const gg = g.createRadialGradient(k.x, y - 8, 1, k.x, y - 8, 16);
        gg.addColorStop(0, `rgba(${col}, 0.35)`);
        gg.addColorStop(1, `rgba(${col}, 0)`);
        g.fillStyle = gg;
        g.fillRect(k.x - 16, y - 24, 32, 32);
        if (Math.random() < 0.15) this.particles.burst('sparkle', k.x + (Math.random() - 0.5) * 12, y - 10 - Math.random() * 10);
      }
      g.globalCompositeOperation = 'source-over';
      g.drawImage(iconSmall(k.item), Math.round(k.x - 8), y - 18 + bob);
    }
  }

  private drawEnemy(g: CanvasRenderingContext2D, e: Enemy, world: World) {
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
      const speed = e.kind === 'moth' || e.kind === 'wisp' ? 10 : 6;
      const f = Math.floor(e.anim * speed) % s.frames.length;
      img = s.frames[f];
      wIdx = f;
    }
    const frozen = e.frost.active > 0;
    if (frozen) {
      img = s.frames[0];
      wIdx = 0;
    }
    const sc = e.scale;
    // Mutation aura beneath.
    if (e.mutations.length) {
      const m = MUTATIONS[e.mutations[0]];
      g.strokeStyle = m.color;
      g.globalAlpha = 0.5 + Math.sin(this.time * 4 + e.id) * 0.2;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(Math.round(e.x), Math.round(e.y + 1), e.r + 3, (e.r + 3) * 0.45, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    const shakeX = e.state === 'windup' ? Math.round(Math.sin(this.time * 60) * 0.6) : 0;
    const bob = e.kind === 'moth' || e.kind === 'wisp' ? Math.round(Math.sin(e.anim * 4) * 2) : 0;
    // Squash on hit: wider and shorter for a moment.
    const sq = e.squash * 0.18;
    const w = Math.round(s.w * sc * (1 + sq));
    const h = Math.round(s.h * sc * (1 - sq));
    const x = Math.round(e.x - w / 2 + shakeX);
    const y = Math.round(e.y + s.oy * sc + (s.h * sc - h) + bob);
    if (e.state === 'dead') g.globalAlpha = Math.max(0, 1 - e.deadT / 0.05);
    g.save();
    if (e.facing < 0) {
      g.translate(x + w, y);
      g.scale(-1, 1);
      g.drawImage(img, 0, 0, w, h);
      if (e.flash > 0) g.drawImage(s.white[wIdx], 0, 0, w, h);
    } else {
      g.drawImage(img, x, y, w, h);
      if (e.flash > 0) g.drawImage(s.white[wIdx], x, y, w, h);
    }
    g.restore();
    g.globalAlpha = 1;
    if (this.has(e, 'armored')) {
      g.fillStyle = '#a8b0bc';
      g.fillRect(x + Math.round(w * 0.25), y + Math.round(h * 0.45), Math.round(w * 0.5), 2);
      g.fillStyle = '#d8dee8';
      g.fillRect(x + Math.round(w * 0.25), y + Math.round(h * 0.45), Math.round(w * 0.5), 1);
    }
    if (e.ward > 0) {
      g.strokeStyle = `rgba(200, 170, 255, ${0.5 + Math.sin(this.time * 5) * 0.2})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(Math.round(e.x), Math.round(e.y - h / 2), w / 2 + 3, h / 2 + 3, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (e.shock.active > 0 && Math.random() < 0.4) {
      g.strokeStyle = '#fff27a';
      g.beginPath();
      let px = e.x + (Math.random() - 0.5) * w;
      let py = y + Math.random() * h;
      g.moveTo(px, py);
      for (let i = 0; i < 3; i++) {
        px += (Math.random() - 0.5) * 8;
        py += (Math.random() - 0.5) * 8;
        g.lineTo(px, py);
      }
      g.stroke();
    }
    if (frozen) this.drawIce(g, e.x, e.y, e.r);
    void world;
  }

  private has(e: Enemy, m: string) {
    return e.mutations.includes(m as never);
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
    if (!b.awake && world.bossFight === 'none' && Math.random() < 0.03) this.particles.burst('leaves', e.x + (Math.random() - 0.5) * 30, e.y - 40, Math.PI / 2, 0.3);
  }

  private drawAlly(g: CanvasRenderingContext2D, a: Ally, world: World) {
    const glow = EL_GLOW[a.el];
    const fade = Math.min(1, (a.life - a.t) * 3);
    g.globalAlpha = fade;
    if (a.kind === 'orbit') {
      g.save();
      g.translate(Math.round(a.x), Math.round(a.y));
      g.rotate(a.angle * 3);
      g.fillStyle = '#ffffff';
      g.fillRect(-3, -1, 6, 2);
      g.fillStyle = glow;
      g.fillRect(-1, -3, 2, 6);
      g.restore();
    } else if (a.kind === 'wisp' || a.kind === 'spirit') {
      const r = a.kind === 'spirit' ? 3 : 2;
      g.fillStyle = glow;
      g.fillRect(Math.round(a.x - r), Math.round(a.y - r), r * 2, r * 2);
      g.fillStyle = '#ffffff';
      g.fillRect(Math.round(a.x - 1), Math.round(a.y - 1), 2, 2);
    } else if (a.kind === 'turret') {
      const x = Math.round(a.x);
      const y = Math.round(a.y);
      g.fillStyle = '#5e3a20';
      g.fillRect(x - 3, y - 6, 6, 8);
      g.fillStyle = '#6fb03c';
      g.fillRect(x - 5, y - 9, 10, 4);
      g.fillStyle = glow;
      g.fillRect(x - 1, y - 8, 2, 2);
    } else if (a.kind === 'decoy') {
      const fr = playerFrames(playerLook(world));
      g.globalAlpha = 0.45 * fade;
      g.drawImage(fr.white[world.player.dir4][0], Math.round(a.x - 8), Math.round(a.y - 17));
      g.globalAlpha = 0.6 * fade;
      g.drawImage(fr.frames[world.player.dir4][0], Math.round(a.x - 8), Math.round(a.y - 17));
    }
    g.globalAlpha = 1;
  }

  private drawProjectile(g: CanvasRenderingContext2D, pr: Projectile) {
    const props = propSprites();
    const x = Math.round(pr.x);
    const y = Math.round(pr.y);
    const a = Math.atan2(pr.vy, pr.vx);
    const glow = EL_GLOW[pr.el];
    switch (pr.kind) {
      case 'seed':
        g.drawImage(props.seed, x - 4, y - 4);
        break;
      case 'firebolt':
        g.fillStyle = '#ff8a2a';
        g.fillRect(x - 2, y - 2, 4, 4);
        g.fillStyle = '#ffe08a';
        g.fillRect(x - 1, y - 1, 2, 2);
        break;
      case 'mortar':
        g.fillStyle = '#a050b0';
        g.fillRect(x - 2, y - 2, 4, 4);
        g.fillStyle = '#e090e0';
        g.fillRect(x - 1, y - 2, 2, 1);
        break;
      case 'arrow': {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.fillStyle = '#c8a070';
        g.fillRect(-6, 0, 8, 1);
        g.fillStyle = pr.el !== 'none' ? glow : '#e8eef8';
        g.fillRect(2, -1, 3, 3);
        g.fillStyle = '#ffffff';
        g.fillRect(-7, -1, 2, 1);
        g.fillRect(-7, 1, 2, 1);
        g.restore();
        break;
      }
      case 'bolt':
      case 'shard':
        g.fillStyle = glow;
        g.fillRect(x - 2, y - 2, 4, 4);
        g.fillStyle = '#ffffff';
        g.fillRect(x - 1, y - 1, 2, 2);
        break;
      case 'orb': {
        const r = Math.round(pr.r);
        g.fillStyle = glow;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.fillRect(x - 2, y - 2, 3, 3);
        break;
      }
      case 'chakram': {
        const item = pr.hit ? null : null;
        void item;
        g.save();
        g.translate(x, y);
        g.rotate(this.time * 25);
        g.strokeStyle = pr.el !== 'none' ? glow : '#d8dee8';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(0, 0, pr.r * 0.8, 0, Math.PI * 2);
        g.stroke();
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 4; i++) g.fillRect(Math.round(Math.cos(i * 1.57) * (pr.r + 1)) - 1, Math.round(Math.sin(i * 1.57) * (pr.r + 1)) - 1, 2, 2);
        g.restore();
        break;
      }
      case 'wave': {
        g.save();
        g.translate(x, y);
        g.rotate(a);
        g.globalAlpha = Math.min(1, pr.life * 3);
        g.strokeStyle = pr.el !== 'none' ? glow : '#eaf2ff';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(-6, 0, pr.r, -1.1, 1.1);
        g.stroke();
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1;
        g.beginPath();
        g.arc(-5, 0, pr.r, -0.9, 0.9);
        g.stroke();
        g.restore();
        break;
      }
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
    if (p.warcryT > 0) {
      g.strokeStyle = `rgba(255, 120, 60, ${0.4 + Math.sin(this.time * 10) * 0.2})`;
      g.beginPath();
      g.ellipse(p.x, p.y + 1, 9, 4, 0, 0, Math.PI * 2);
      g.stroke();
    }
    if (ws && weaponBehind) this.drawWeapon(g, world);
    if (p.state === 'dead') g.globalAlpha = Math.max(0, 1 - p.stateT / 0.6);
    if (p.state === 'dodge') {
      const t = p.stateT / 0.3;
      const ang = t * Math.PI * 2 * (p.dodgeDx >= 0 ? 1 : -1);
      for (let i = 3; i >= 1; i--) {
        g.globalAlpha = 0.14 * i;
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
    if (p.echoArmed > 0 || p.echoPending > 0 || p.mirrorT > 0) {
      g.globalAlpha = 0.3 + Math.sin(this.time * 10) * 0.12;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(fr.white[dir][0], x + 3, y);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    if (p.shield > 0) {
      g.strokeStyle = `rgba(140, 210, 255, ${0.45 + Math.sin(this.time * 6) * 0.15})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(Math.round(p.x), Math.round(p.y - 8), 9, 11, 0, 0, Math.PI * 2);
      g.stroke();
    }
  }

  private drawWeapon(g: CanvasRenderingContext2D, world: World) {
    const p = world.player;
    const ws = weaponStats(p)!;
    const held = heldWeapon(ws.item);
    let angle: number;
    let trail: { from: number; to: number; reach: number; alpha: number; arc: number } | null = null;
    const hx = p.x;
    const hy = p.y - 7;
    const ranged = ws.fam.ranged;
    if (p.state === 'attack') {
      const s = ws.combo[p.atkStep];
      if (ranged) angle = p.atkDir;
      else {
        const start = p.atkDir - (s.arc / 2) * s.sweep;
        const end = p.atkDir + (s.arc / 2) * s.sweep;
        if (p.atkPhase === 'windup') angle = start - 0.35 * s.sweep * (p.atkT / s.windup);
        else if (p.atkPhase === 'active') {
          const t = Math.min(1, p.atkT / s.active);
          angle = start + (end - start) * t;
          trail = { from: start, to: angle, reach: s.reach * ws.reachMul, alpha: 1, arc: s.arc };
        } else {
          angle = end;
          const t = p.atkT / s.recovery;
          if (t < 0.5) trail = { from: start, to: end, reach: s.reach * ws.reachMul, alpha: 1 - t * 2, arc: s.arc };
        }
        // Thrusts point straight at the target.
        if (s.arc < 0.8) angle = p.atkDir;
      }
    } else if (p.state === 'skill') {
      angle = p.skillDir + (p.skillId === 'fracture' ? (p.stateT < 0.42 ? -1.6 + (p.stateT / 0.42) * 0.2 : 0.3) : p.skillId === 'reap' ? this.time * 30 : 0);
    } else if (ranged) angle = p.face;
    else angle = p.dir4 === 0 ? 1.9 : p.dir4 === 1 ? -1.2 : p.dir4 === 2 ? 2.4 : 0.75;
    if (trail) this.drawSwingTrail(g, hx, hy, trail.from, trail.to, trail.reach, ws.item.element, trail.alpha, ws.fam.heavy, trail.arc, p.atkDir);
    g.save();
    let off = p.state === 'free' || p.state === 'flask' ? 4 : 2;
    if (p.state === 'attack' && !ranged) {
      const s = ws.combo[p.atkStep];
      if (s.arc < 0.8 && p.atkPhase === 'active') off = 6 + (p.atkT / s.active) * 6;
    }
    g.translate(Math.round(hx + Math.cos(angle) * off), Math.round(hy + 2 + Math.sin(angle) * off));
    g.rotate(angle);
    g.drawImage(held.img, -held.gx, -held.gy);
    g.restore();
  }

  /** Filled crescent ribbon, brightest at the leading edge. */
  private drawSwingTrail(g: CanvasRenderingContext2D, x: number, y: number, from: number, to: number, reach: number, el: Element, alpha: number, heavy: boolean, arc: number, dir: number) {
    const glow = EL_GLOW[el];
    if (arc < 0.8) {
      // Thrust: a straight streak.
      g.save();
      g.translate(x, y);
      g.rotate(dir);
      g.globalAlpha = alpha * 0.85;
      g.fillStyle = glow;
      g.fillRect(6, -2, reach, 4);
      g.fillStyle = '#ffffff';
      g.fillRect(8, -1, reach - 2, 2);
      g.restore();
      g.globalAlpha = 1;
      return;
    }
    const steps = 14;
    const inner = reach * (heavy ? 0.45 : 0.55);
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a0 = from + (to - from) * t0;
      const a1 = from + (to - from) * t1;
      const r0 = reach * (0.86 + 0.14 * t0);
      const r1 = reach * (0.86 + 0.14 * t1);
      g.globalAlpha = alpha * (0.08 + t1 * t1 * 0.7);
      g.fillStyle = t1 > 0.8 ? '#ffffff' : glow;
      g.beginPath();
      g.moveTo(x + Math.cos(a0) * inner, y + Math.sin(a0) * inner * 0.85);
      g.lineTo(x + Math.cos(a0) * r0, y + Math.sin(a0) * r0 * 0.85);
      g.lineTo(x + Math.cos(a1) * r1, y + Math.sin(a1) * r1 * 0.85);
      g.lineTo(x + Math.cos(a1) * inner, y + Math.sin(a1) * inner * 0.85);
      g.closePath();
      g.fill();
    }
    // Bright edge.
    g.globalAlpha = alpha;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = from + (to - from) * t;
      const r = reach * (0.86 + 0.14 * t);
      if (t < 0.4) continue;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 0.85;
      if (i === Math.ceil(steps * 0.4)) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    g.globalAlpha = 1;
  }

  private drawLighting(g: CanvasRenderingContext2D, world: World) {
    const vis = this.vis!;
    const t = this.time;
    g.globalCompositeOperation = 'lighter';
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
    const light = (x: number, y: number, r: number, rgb: string, a: number) => {
      if (!this.onScreen(x, y, r)) return;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${rgb}, ${a})`);
      grd.addColorStop(1, `rgba(${rgb}, 0)`);
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (const tc of vis.torches) {
      const fl = 0.8 + Math.sin(t * 9 + tc.phase) * 0.1 + Math.sin(t * 23 + tc.phase) * 0.05;
      light(tc.x, tc.y + 4, 34 * fl, this.theme.torchColor, 0.36);
    }
    // Dynamic lights: projectiles, allies, burning foes, novas live in particles.
    for (const pr of world.projectiles) {
      if (pr.owner === 'player') light(pr.x, pr.y, pr.kind === 'orb' ? 22 : 12, EL_RGB[pr.el], 0.22);
      else if (pr.kind === 'firebolt') light(pr.x, pr.y, 14, '255, 150, 60', 0.3);
    }
    for (const a of world.allies) if (a.kind !== 'decoy') light(a.x, a.y, 14, EL_RGB[a.el], 0.2);
    for (const e of world.enemies) {
      if (e.burn.active > 0) light(e.x, e.y - 6, 20, '255, 140, 50', 0.25);
      if (e.kind === 'wisp' && e.state !== 'dead') light(e.x, e.y - 10, 26, '255, 170, 80', 0.28);
    }
    for (const f of world.features) if (f.kind === 'merchant') light(f.x + 9, f.y - 8, 26, '255, 200, 110', 0.2);
    const ws = weaponStats(world.player);
    if (ws && ws.item.element !== 'none' && world.player.state !== 'dead' && !this.hidePlayer) light(world.player.x, world.player.y - 6, 18, EL_RGB[ws.item.element], 0.12);
    g.globalCompositeOperation = 'source-over';
    for (const tc of vis.torches) {
      if (!this.onScreen(tc.x, tc.y, 20)) continue;
      const f = Math.floor(t * 10 + tc.phase) % 3;
      g.fillStyle = '#ff9a3a';
      g.fillRect(tc.x - 1, tc.y - 3 - f, 3, 3 + f);
      g.fillStyle = '#ffe07a';
      g.fillRect(tc.x, tc.y - 2 - (f % 2), 1, 2);
    }
  }

  private drawOverheads(g: CanvasRenderingContext2D, world: World) {
    const STATUS_COL = { poison: '#9cf05a', frost: '#9ae8ff', burn: '#ffae4a', shock: '#fff27a' } as const;
    for (const e of world.enemies) {
      if (e.state === 'dead' || e.boss) continue;
      const anyBuild = e.poison.build > 0 || e.frost.build > 0 || e.burn.build > 0 || e.shock.build > 0;
      if (!e.aggro && e.hp >= e.maxHp && !anyBuild) continue;
      const s = enemySprites(e.kind, e.elite);
      const w = Math.round((e.elite ? 18 : 14) * Math.max(1, e.scale * 0.9));
      const x = Math.round(e.x - w / 2);
      const y = Math.round(e.y + s.oy * e.scale - 4 + (e.kind === 'moth' || e.kind === 'wisp' ? 2 : 4));
      g.fillStyle = '#140e14';
      g.fillRect(x - 1, y - 1, w + 2, 4);
      g.fillStyle = '#3a1a1a';
      g.fillRect(x, y, w, 2);
      g.fillStyle = e.elite ? '#ff8a3a' : '#e04a3a';
      g.fillRect(x, y, Math.max(0, Math.round((w * e.hp) / e.maxHp)), 2);
      if (e.ward > 0) {
        g.fillStyle = '#c8b0ff';
        g.fillRect(x, y - 2, Math.round(Math.min(1, e.ward / (e.maxHp * 0.4)) * w), 1);
      }
      if (e.elite) {
        g.fillStyle = '#ffd25a';
        g.fillRect(x - 3, y - 1, 2, 2);
        g.fillRect(x - 4, y - 2, 1, 1);
        g.fillRect(x - 2, y - 2, 1, 1);
      }
      // Mutation pips on the right.
      e.mutations.forEach((m, i) => {
        g.fillStyle = MUTATIONS[m].color;
        g.fillRect(x + w + 2, y - 1 + i * 3, 2, 2);
      });
      let my = y + 3;
      for (const kind of ['poison', 'frost', 'burn', 'shock'] as const) {
        const st = e[kind];
        if (st.build <= 0 && st.active <= 0) continue;
        const col = STATUS_COL[kind];
        const thr = e.resistBase[kind] * st.resist;
        const fill = st.active > 0 ? 1 : st.build / thr;
        g.fillStyle = '#140e14';
        g.fillRect(x - 1, my, w + 2, 3);
        g.fillStyle = st.active > 0 && Math.floor(this.time * 6) % 2 ? '#ffffff' : col;
        g.fillRect(x, my + 1, Math.round(w * Math.min(1, fill)), 1);
        my += 3;
      }
    }
    const p = world.player;
    let py = Math.round(p.y - 22);
    for (const [kind, col] of [
      ['poison', '#9cf05a'],
      ['burn', '#ffae4a'],
      ['chill', '#9ae8ff'],
    ] as const) {
      const s = p[kind];
      if (s.build <= 0 || s.active > 0) continue;
      const x = Math.round(p.x - 7);
      g.fillStyle = '#140e14';
      g.fillRect(x - 1, py, 16, 3);
      g.fillStyle = col;
      g.fillRect(x, py + 1, Math.round(14 * Math.min(1, s.build / 100)), 1);
      py -= 3;
    }
  }

  private drawNumbers(g: CanvasRenderingContext2D) {
    const COL: Record<string, string> = {
      crit: '#ffd84a',
      hurt: '#ff5a4a',
      heal: '#7aff9a',
      poison: '#9cf05a',
      burn: '#ffae4a',
      shock: '#fff27a',
      shatter: '#9ae8ff',
      shield: '#9ad8ff',
      proc: '#d8c8ff',
      block: '#c0c8d8',
    };
    for (const n of this.particles.numbers) {
      const big = n.kind === 'crit' || n.kind === 'shatter';
      const col = COL[n.kind] ?? '#ffffff';
      const text = n.kind === 'crit' ? `${n.text}!` : n.text;
      const age = 1 - n.life / n.max;
      g.globalAlpha = Math.min(1, n.life * 4);
      // Pop: crits jump up then settle.
      const pop = big && age < 0.15 ? -2 : 0;
      drawText(g, text, n.x - textWidth(text, big) / 2, n.y - (big ? 7 : 5) + pop, col, big);
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
    } else if (n.kind === 'feature') {
      x = n.feature.x;
      y = n.feature.y - 28;
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
function iconSmall(item: Item): HTMLCanvasElement {
  const hit = smallIcons.get(item.uid);
  if (hit) return hit;
  const src = itemIcon(item);
  const c = canvas(16, 16);
  ctx2d(c).drawImage(src, 0, 0, 16, 16);
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
