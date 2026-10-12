import { FAMILIES, Item, RELICS } from '../data/items';
import { itemIcon } from '../render/icons';
import { ctx2d } from '../render/pixel';
import { Renderer } from '../render/renderer';
import { playerFrames } from '../render/sprites';
import { playerLook } from '../render/renderer';
import { World } from '../sim/world';
import { T, TILE } from '../world/tiles';
import { Input } from './input';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Hud {
  private hpFill = $('hp-fill');
  private hpChip = $('hp-chip');
  private hpText = $('hp-text');
  private flasks = $('flasks');
  private statuses = $('statuses');
  private gold = $('gold').querySelector('span')!;
  private banner = $('banner-text');
  private objective = $('objective');
  private minimap = $<HTMLCanvasElement>('minimap');
  private portrait = $<HTMLCanvasElement>('portrait');
  private bossBar = $('boss-bar');
  private bossFill = $('boss-fill');
  private bossChip = $('boss-chip');
  private bossStatus = $('boss-status');
  private toasts = $('toasts');
  private interact = $('interact');
  private skillBtn = $('btn-skill');
  private attackBtn = $('btn-attack');
  private swapBtn = $('btn-swap');
  private flaskBtn = $('btn-flask');
  private relicBtn = $('btn-relic');
  private callouts = $('callouts');
  private comboEl = $('combo');
  private cache = new Map<string, string | number | boolean>();
  seen: Uint8Array = new Uint8Array(0);
  private seenKey = '';
  private seenT = 0;
  private lastToast = new Map<string, number>();

  constructor(
    private renderer: Renderer,
    private input: Input,
  ) {
    // Interact button: tap to use, hold for stairs.
    const it = this.interact;
    it.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.input.press('interact');
    });
    const up = () => this.input.release('interact');
    it.addEventListener('pointerup', up);
    it.addEventListener('pointercancel', up);
    it.addEventListener('pointerleave', up);
  }

  private set(key: string, v: string | number | boolean, apply: () => void) {
    if (this.cache.get(key) === v) return;
    this.cache.set(key, v);
    apply();
  }

  setBanner(text: string) {
    this.set('banner', text, () => (this.banner.textContent = text));
  }

  setObjective(text: string) {
    this.set('obj', text, () => (this.objective.textContent = text));
  }

  toast(msg: string, kind: 'info' | 'synergy' | 'warn' | 'hint' = 'info', dur = 2.8, id?: string): HTMLElement | null {
    const now = performance.now();
    if ((this.lastToast.get(msg) ?? 0) + 1500 > now) return null;
    this.lastToast.set(msg, now);
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = msg;
    if (id) el.dataset.id = id;
    // Only one tutorial hint at a time.
    if (kind === 'hint') this.toasts.querySelectorAll('.toast.hint').forEach((t) => t.remove());
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.classList.add('fade'), dur * 1000);
    setTimeout(() => el.remove(), dur * 1000 + 600);
    return el;
  }

  /** Remove a hint once the player has done what it asked. */
  dismiss(id: string): void {
    this.toasts.querySelectorAll(`.toast[data-id="${id}"]`).forEach((t) => {
      t.classList.add('fade');
      setTimeout(() => t.remove(), 500);
    });
  }

  clearToasts(): void {
    this.toasts.innerHTML = '';
    this.callouts.innerHTML = '';
  }

  /** Big centred callout text (multi-kills, mythic drops, boss names). */
  callout(text: string, tier: number): void {
    for (const c of Array.from(this.callouts.children)) if (c.textContent === text) return;
    const el = document.createElement('div');
    el.className = `callout t${tier}`;
    el.textContent = text;
    this.callouts.appendChild(el);
    while (this.callouts.children.length > 2) this.callouts.firstElementChild!.remove();
    setTimeout(() => el.remove(), 1600 + tier * 300);
  }

  setFloorMod(text: string): void {
    const el = document.getElementById('floor-mod')!;
    el.classList.toggle('hidden', !text);
    el.textContent = text;
  }

  update(world: World, dt: number, bonusHp: number): void {
    const p = world.player;
    const maxHp = p.build.maxHp;
    const hp = Math.max(0, Math.ceil(p.hp));
    void bonusHp;
    this.set('hp', `${hp}/${maxHp}`, () => {
      const f = Math.max(0, hp / maxHp);
      this.hpFill.style.transform = `scaleX(${f})`;
      this.hpChip.style.transform = `scaleX(${f})`;
      this.hpText.textContent = `${hp} / ${maxHp}`;
    });
    this.set('flasks', `${p.flasks}/${p.maxFlasks}`, () => {
      this.flasks.innerHTML = '';
      for (let i = 0; i < p.maxFlasks; i++) {
        const el = document.createElement('i');
        if (i >= p.flasks) el.className = 'empty';
        this.flasks.appendChild(el);
      }
      this.flaskBtn.querySelector('.count')!.textContent = `${p.flasks}`;
      this.flaskBtn.classList.toggle('empty', p.flasks <= 0);
    });
    const st = p.poison.active > 0 ? 'poison' : '';
    this.set('status', st, () => {
      this.statuses.innerHTML = st ? '<span class="st" style="color:var(--poison)">☠ Poisoned</span>' : '';
    });
    this.set('gold', p.gold, () => (this.gold.textContent = `${p.gold}`));

    // Portrait (redraw when look changes).
    const look = playerLook(world);
    this.set('portrait', look.tunic + look.boot, () => {
      const g = ctx2d(this.portrait);
      g.clearRect(0, 0, 16, 16);
      g.drawImage(playerFrames(look).frames[0][0], 0, 0, 16, 16, 0, 2, 16, 16);
    });

    // Weapon icons on attack/swap/skill buttons.
    const w0 = p.loadout.weapons[0];
    const w1 = p.loadout.weapons[1];
    const active = p.loadout.weapons[p.weaponIndex];
    this.set('wicons', `${w0?.uid}|${w1?.uid}|${p.weaponIndex}`, () => {
      drawIcon(this.attackBtn.querySelector('canvas')!, active);
      drawIcon(this.swapBtn.querySelector('canvas.w0')!, w0);
      drawIcon(this.swapBtn.querySelector('canvas.w1')!, w1);
      this.swapBtn.querySelector('canvas.w0')!.classList.toggle('active', p.weaponIndex === 0);
      this.swapBtn.querySelector('canvas.w1')!.classList.toggle('active', p.weaponIndex === 1);
      drawSkillIcon(this.skillBtn.querySelector('canvas')!, active);
      this.skillBtn.title = active?.family ? FAMILIES[active.family].skill.name : '';
    });
    const cd = p.skillCd[p.weaponIndex];
    const total = active?.family ? FAMILIES[active.family].skill.cooldown : 1;
    const cdq = Math.round((cd / total) * 40);
    this.set('cd', cdq, () => {
      const circle = this.skillBtn.querySelector('circle') as SVGCircleElement;
      circle.style.strokeDashoffset = `${113 - (113 * cdq) / 40}`;
      this.skillBtn.classList.toggle('cooling', cdq > 0);
    });

    // Relic button.
    const relic = p.loadout.relic;
    this.set('relic', relic?.uid ?? '', () => {
      this.relicBtn.classList.toggle('hidden', !relic);
      drawIcon(this.relicBtn.querySelector('canvas')!, relic);
      this.relicBtn.title = relic?.relic ? RELICS[relic.relic.ability].name : '';
    });
    if (relic?.relic) {
      const rq = Math.round((p.relicCd / (relic.relic.cooldown * p.build.skillCdMul)) * 40);
      this.set('rcd', rq, () => {
        const circle = this.relicBtn.querySelector('circle') as SVGCircleElement;
        circle.style.strokeDashoffset = `${113 - (113 * Math.max(0, rq)) / 40}`;
        this.relicBtn.classList.toggle('cooling', rq > 0);
      });
    }
    // Combo meter.
    const combo = world.combo;
    this.set('combo', combo, () => {
      this.comboEl.classList.toggle('on', combo >= 5);
      this.comboEl.querySelector('b')!.textContent = `${combo}`;
      this.comboEl.classList.toggle('hot', combo >= 25);
      this.comboEl.classList.remove('bump');
      void this.comboEl.offsetWidth;
      this.comboEl.classList.add('bump');
    });

    // Boss bar.
    const boss = world.boss;
    const showBoss = !!boss && world.bossFight === 'active';
    this.set('bossOn', showBoss, () => this.bossBar.classList.toggle('hidden', !showBoss));
    if (boss && showBoss) {
      const f = Math.max(0, boss.hp / boss.maxHp);
      const q = Math.round(f * 200);
      this.set('bossHp', q, () => {
        this.bossFill.style.transform = `scaleX(${f})`;
        this.bossChip.style.transform = `scaleX(${f})`;
      });
      const b = boss.boss!;
      const status = b.stunned > 0 ? 'CORE EXPOSED' : b.chill > 0 ? 'CHILLED · slowed' : boss.poison.active > 0 ? 'POISONED' : '';
      this.set('bossSt', status, () => {
        this.bossStatus.textContent = status;
        this.bossStatus.style.color = b.stunned > 0 ? 'var(--gold)' : b.chill > 0 ? 'var(--frost)' : 'var(--poison)';
      });
    }

    // Contextual interact prompt anchored near the character.
    const n = world.nearby;
    let verb = '';
    let ax = p.x;
    let ay = p.y - 30;
    if (n?.kind === 'chest') {
      verb = n.chest.guarded ? 'Open guarded chest' : 'Open chest';
      ax = n.chest.x;
      ay = n.chest.y - 20;
    } else if (n?.kind === 'item') {
      verb = `Inspect ${n.pickup.item!.name}`;
      ax = n.pickup.x;
      ay = n.pickup.y - 32;
    } else if (n?.kind === 'feature') {
      verb = n.feature.kind === 'spring' ? 'Drink from spring' : n.feature.kind === 'shrine' ? 'Touch the cursed shrine' : 'Trade with the merchant';
      ax = n.feature.x;
      ay = n.feature.y - 30;
    } else if (n?.kind === 'stairs') {
      verb = 'Hold to descend';
      const s = world.stairsCenter();
      ax = s.x;
      ay = s.y - 28;
    }
    this.set('verb', verb, () => {
      this.interact.classList.toggle('hidden', !verb);
      this.interact.querySelector('.verb')!.textContent = verb;
    });
    if (verb) {
      const s = this.renderer.toScreen(ax, ay);
      this.interact.style.left = `${s.x}px`;
      this.interact.style.top = `${s.y}px`;
      let hold = this.interact.querySelector('.hold') as HTMLElement | null;
      if (n?.kind === 'stairs') {
        if (!hold) {
          hold = document.createElement('div');
          hold.className = 'hold';
          this.interact.appendChild(hold);
        }
        hold.style.width = `${Math.min(100, (world.descendHold / 0.7) * 100)}%`;
      } else hold?.remove();
    }

    this.updateSeen(world, dt);
    this.drawMinimap(world);
  }

  private updateSeen(world: World, dt: number) {
    const key = `${world.plan.seed}:${world.plan.floor}`;
    const map = world.map;
    if (key !== this.seenKey) {
      this.seenKey = key;
      this.seen = new Uint8Array(map.w * map.h);
      // Restore knowledge of rooms explored before a reload.
      world.rooms.forEach((r) => {
        if (!world.explored[r.id]) return;
        for (let y = r.y - 2; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) if (map.inBounds(x, y)) this.seen[y * map.w + x] = 1;
      });
    }
    this.seenT -= dt;
    if (this.seenT > 0) return;
    this.seenT = 0.15;
    const px = Math.floor(world.player.x / TILE);
    const py = Math.floor(world.player.y / TILE);
    const R = 7;
    for (let y = py - R; y <= py + R; y++)
      for (let x = px - R; x <= px + R; x++) {
        if (!map.inBounds(x, y) || (x - px) ** 2 + (y - py) ** 2 > R * R) continue;
        if (map.lineOfSight(world.player.x, world.player.y - 4, (x + 0.5) * TILE, (y + 0.5) * TILE) || map.get(x, y) === T.Wall) this.seen[y * map.w + x] = 1;
      }
  }

  drawMap(world: World, cv: HTMLCanvasElement, px: number, blink: boolean): void {
    const map = world.map;
    cv.width = map.w * px;
    cv.height = map.h * px;
    const g = ctx2d(cv);
    g.fillStyle = '#0b0f12';
    g.fillRect(0, 0, cv.width, cv.height);
    for (let y = 0; y < map.h; y++)
      for (let x = 0; x < map.w; x++) {
        if (!this.seen[y * map.w + x]) continue;
        const t = map.get(x, y);
        if (t === T.Floor || t === T.Pillar) g.fillStyle = '#8a8670';
        else if (t === T.Water) g.fillStyle = '#2a9a98';
        else if (t === T.Wall) g.fillStyle = '#3a3a30';
        else continue;
        g.fillRect(x * px, y * px, px, px);
      }
    const dot = (x: number, y: number, c: string, s = px * 1.5) => {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (!this.seen[ty * map.w + tx]) return;
      g.fillStyle = c;
      g.fillRect(Math.round((x / TILE) * px - s / 2), Math.round((y / TILE) * px - s / 2), Math.ceil(s), Math.ceil(s));
    };
    for (const c of world.chests) if (!c.opened) dot(c.x, c.y, c.guarded ? '#c0d0e0' : '#e0b04a', px * 2);
    for (const s of world.features) if (!s.used || s.kind === 'merchant') dot(s.x, s.y, s.kind === 'spring' ? '#5ae0d0' : s.kind === 'shrine' ? '#c070ff' : '#ffb060', px * 2);
    for (const k of world.pickups) if (k.kind === 'item') dot(k.x, k.y, '#ffffff', px * 1.5);
    if (world.stairsOpen) {
      const s = world.stairsCenter();
      dot(s.x, s.y, '#ffd36a', px * 3);
    }
    if (world.boss && world.explored[world.boss.room]) dot(world.boss.x, world.boss.y, '#ff6a4a', px * 3);
    if (!blink) dot(world.player.x, world.player.y, '#7affb0', px * 2.2);
  }

  private mmT = 0;
  private drawMinimap(world: World) {
    this.mmT++;
    if (this.mmT % 6 !== 0) return;
    this.drawMap(world, this.minimap, 2, Math.floor(this.mmT / 24) % 2 === 1);
  }
}

function drawIcon(cv: HTMLCanvasElement, item: Item | null | undefined) {
  const g = ctx2d(cv);
  g.clearRect(0, 0, cv.width, cv.height);
  if (item) g.drawImage(itemIcon(item), 0, 0);
}

function drawSkillIcon(cv: HTMLCanvasElement, item: Item | null | undefined) {
  const g = ctx2d(cv);
  g.clearRect(0, 0, 32, 32);
  if (!item?.family) return;
  const col = item.element === 'frost' ? '#9ae8ff' : item.element === 'poison' ? '#9cf05a' : '#f4ecd8';
  g.strokeStyle = col;
  g.fillStyle = col;
  g.lineWidth = 3;
  if (item.family === 'sword') {
    g.beginPath();
    g.arc(12, 16, 11, -1.1, 1.1);
    g.stroke();
    g.lineWidth = 1;
    g.beginPath();
    g.arc(18, 16, 9, -1, 1);
    g.stroke();
  } else if (item.family === 'daggers') {
    g.fillRect(4, 15, 20, 2);
    g.beginPath();
    g.moveTo(28, 16);
    g.lineTo(21, 10);
    g.lineTo(21, 22);
    g.fill();
    g.fillRect(6, 8, 2, 2);
    g.fillRect(6, 22, 2, 2);
  } else {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillRect(Math.round(16 + Math.cos(a) * 11), Math.round(18 + Math.sin(a) * 8), 3, 3);
    }
    g.fillRect(13, 15, 6, 6);
  }
}
