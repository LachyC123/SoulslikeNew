import type { BurstKind, NumKind } from '../sim/world';

interface Particle {
  kind: 'spark' | 'leaf' | 'shard' | 'bubble' | 'dust' | 'ring' | 'glow' | 'mote' | 'petal';
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  drag: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  vr: number;
  add: boolean;
}

export interface DamageNumber {
  x: number;
  y: number;
  text: string;
  kind: NumKind;
  life: number;
  vx: number;
}

const MAX_PARTICLES = 900;

export class Particles {
  list: Particle[] = [];
  numbers: DamageNumber[] = [];
  lowEffects = false;

  private add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.list.length >= MAX_PARTICLES * (this.lowEffects ? 0.4 : 1)) return;
    this.list.push({
      kind: 'spark',
      vx: 0,
      vy: 0,
      g: 0,
      drag: 2,
      life: 0.5,
      max: 0.5,
      color: '#ffffff',
      size: 1,
      rot: 0,
      vr: 0,
      add: false,
      ...p,
      ...(p.life !== undefined && p.max === undefined ? { max: p.life } : {}),
    });
  }

  number(x: number, y: number, text: string, kind: NumKind): void {
    // Group rapid poison ticks so text never floods the screen.
    this.numbers.push({ x: x + (Math.random() - 0.5) * 6, y, text, kind, life: kind === 'crit' || kind === 'shatter' ? 0.95 : 0.75, vx: (Math.random() - 0.5) * 14 });
    if (this.numbers.length > 40) this.numbers.shift();
  }

  burst(kind: BurstKind, x: number, y: number, angle = 0, scale = 1): void {
    const n = (k: number) => Math.max(1, Math.round(k * scale * (this.lowEffects ? 0.45 : 1)));
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    switch (kind) {
      case 'hit':
        for (let i = 0; i < n(6); i++) {
          const a = angle + rnd(-0.9, 0.9);
          const s = rnd(40, 110);
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.15, 0.3), color: i % 2 ? '#ffffff' : '#ffe9a8', drag: 6 });
        }
        this.add({ kind: 'glow', x, y, life: 0.12, size: 7, color: '255,240,200', add: true });
        break;
      case 'heavyHit':
        for (let i = 0; i < n(12); i++) {
          const a = angle + rnd(-1.4, 1.4);
          const s = rnd(50, 150);
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 200, life: rnd(0.25, 0.5), color: i % 3 ? '#e8dcc0' : '#ffffff', drag: 3, size: i % 4 ? 1 : 2 });
        }
        this.add({ kind: 'ring', x, y, life: 0.25, size: 14, color: '#fff4d0' });
        this.add({ kind: 'glow', x, y, life: 0.15, size: 12, color: '255,230,180', add: true });
        break;
      case 'shatter':
        for (let i = 0; i < n(26); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(40, 170);
          this.add({ kind: 'shard', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: 160, life: rnd(0.4, 0.8), color: i % 3 ? '#9ae8ff' : '#e8fcff', drag: 2.5, size: rnd(2, 4), rot: a, vr: rnd(-12, 12) });
        }
        this.add({ kind: 'ring', x, y, life: 0.35, size: 26, color: '#bff4ff' });
        this.add({ kind: 'glow', x, y, life: 0.3, size: 26, color: '150,230,255', add: true });
        break;
      case 'freeze':
        for (let i = 0; i < n(10); i++) {
          const a = rnd(0, Math.PI * 2);
          this.add({ kind: 'shard', x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 4, vx: Math.cos(a) * 20, vy: -rnd(10, 40), life: rnd(0.3, 0.6), color: '#cff6ff', size: 2, rot: a, vr: 4, drag: 3 });
        }
        this.add({ kind: 'glow', x, y, life: 0.3, size: 14, color: '150,230,255', add: true });
        break;
      case 'frostStep':
        for (let i = 0; i < n(18); i++) {
          const a = (i / 18) * Math.PI * 2;
          this.add({ kind: 'shard', x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60, life: 0.35, color: '#bff4ff', size: 2, rot: a, drag: 5 });
        }
        this.add({ kind: 'ring', x, y, life: 0.3, size: 30 * scale, color: '#9ae8ff' });
        break;
      case 'spores':
        for (let i = 0; i < n(14); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(15, 60);
          this.add({ kind: 'bubble', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, life: rnd(0.5, 1), color: i % 2 ? '#9cf05a' : '#5ab83a', size: rnd(1, 2.5), drag: 2 });
        }
        this.add({ kind: 'glow', x, y, life: 0.3, size: 14 * scale, color: '150,240,90', add: true });
        break;
      case 'poisonTick':
        for (let i = 0; i < n(3); i++) this.add({ kind: 'bubble', x: x + rnd(-4, 4), y: y + rnd(-2, 3), vy: -rnd(10, 25), life: rnd(0.4, 0.7), color: '#9cf05a', size: 1.5, drag: 1 });
        break;
      case 'death':
        for (let i = 0; i < n(16); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(20, 90);
          this.add({ kind: i % 2 ? 'leaf' : 'dust', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: i % 2 ? 60 : 0, life: rnd(0.4, 0.9), color: i % 2 ? '#6fae3c' : '#cdbf9a', size: i % 2 ? 2 : rnd(3, 5), drag: 3, rot: a, vr: rnd(-6, 6) });
        }
        this.add({ kind: 'glow', x, y, life: 0.25, size: 16, color: '255,220,150', add: true });
        break;
      case 'bossDeath':
        for (let i = 0; i < n(60); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(30, 200);
          this.add({ kind: i % 3 ? 'leaf' : 'petal', x, y: y - 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 90, life: rnd(0.8, 1.8), color: i % 3 ? '#7ab443' : '#ffd6c4', size: 2, drag: 1.5, rot: a, vr: rnd(-6, 6) });
        }
        this.add({ kind: 'ring', x, y, life: 0.6, size: 60, color: '#fff2c0' });
        this.add({ kind: 'glow', x, y, life: 0.8, size: 60, color: '255,220,150', add: true });
        break;
      case 'dust':
        for (let i = 0; i < n(2); i++) this.add({ kind: 'dust', x: x + rnd(-3, 3), y: y + rnd(-1, 1), vx: rnd(-10, 10), vy: rnd(-8, 0), life: rnd(0.25, 0.45), color: '#d8ccaa', size: rnd(1.5, 3), drag: 3 });
        break;
      case 'fracture':
        for (let i = 0; i < n(24); i++) {
          const a = rnd(0, Math.PI * 2);
          const s = rnd(60, 180);
          this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - 40, g: 260, life: rnd(0.4, 0.7), color: i % 2 ? '#9b957c' : '#6a6450', size: i % 3 ? 1 : 2, drag: 2 });
        }
        this.add({ kind: 'ring', x, y, life: 0.35, size: 54, color: '#f0e6c8' });
        this.add({ kind: 'ring', x, y, life: 0.25, size: 36, color: '#ffffff' });
        this.add({ kind: 'glow', x, y, life: 0.2, size: 30, color: '255,230,180', add: true });
        break;
      case 'heal':
        for (let i = 0; i < n(14); i++) this.add({ kind: 'spark', x: x + rnd(-7, 7), y: y + rnd(-6, 6), vy: -rnd(20, 45), life: rnd(0.5, 0.9), color: i % 2 ? '#9affb0' : '#eaffee', drag: 1, size: 1 });
        this.add({ kind: 'glow', x, y, life: 0.5, size: 16, color: '120,255,160', add: true });
        break;
      case 'chest':
        for (let i = 0; i < n(20); i++) {
          const a = rnd(-Math.PI, 0);
          const s = rnd(30, 100);
          this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 80, life: rnd(0.5, 1), color: i % 2 ? '#ffe07a' : '#fff8d0', drag: 2 });
        }
        this.add({ kind: 'glow', x, y, life: 0.5, size: 22, color: '255,220,130', add: true });
        break;
      case 'sparkle':
        this.add({ kind: 'spark', x, y, vy: -10, life: 0.6, color: '#fff8d0', drag: 1 });
        break;
      case 'leaves':
        for (let i = 0; i < n(8); i++) {
          const a = angle + rnd(-1.2, 1.2);
          const s = rnd(30, 90);
          this.add({ kind: 'leaf', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, g: 50, life: rnd(0.4, 0.8), color: i % 2 ? '#7ab443' : '#4f8a34', size: 2, drag: 3, rot: a, vr: rnd(-8, 8) });
        }
        this.add({ kind: 'dust', x, y, life: 0.3, size: 6, color: '#cdbf9a', drag: 1 });
        break;
      case 'erupt':
        for (let i = 0; i < n(10); i++) {
          const a = -Math.PI / 2 + rnd(-0.8, 0.8);
          const s = rnd(50, 120);
          this.add({ x: x + rnd(-6, 6), y, vx: Math.cos(a) * s * 0.5, vy: Math.sin(a) * s, g: 300, life: rnd(0.3, 0.5), color: i % 2 ? '#8a5a34' : '#b8433a', size: 2, drag: 1 });
        }
        this.add({ kind: 'dust', x, y, life: 0.4, size: 10, color: '#a89a78', drag: 1 });
        break;
      case 'roar':
        this.add({ kind: 'ring', x, y, life: 0.5, size: 70, color: '#ffe0a0' });
        this.add({ kind: 'ring', x, y, life: 0.4, size: 50, color: '#ffffff' });
        for (let i = 0; i < n(20); i++) {
          const a = rnd(0, Math.PI * 2);
          this.add({ kind: 'leaf', x, y, vx: Math.cos(a) * 120, vy: Math.sin(a) * 90, life: 0.7, color: '#7ab443', size: 2, drag: 2, rot: a, vr: 6 });
        }
        break;
    }
  }

  /** Ambient motes in sunbeams, sparkles over stairs, etc. */
  ambient(x: number, y: number, kind: 'mote' | 'firefly' | 'stair'): void {
    if (kind === 'mote') this.add({ kind: 'mote', x, y, vx: (Math.random() - 0.5) * 4, vy: 3 + Math.random() * 4, life: 3, color: '255,245,210', size: 1, drag: 0, add: true });
    else if (kind === 'firefly') this.add({ kind: 'mote', x, y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 2.5, color: '230,255,140', size: 1, drag: 0, add: true });
    else this.add({ kind: 'spark', x, y, vy: -12 - Math.random() * 10, life: 1.2, color: '#ffd88a', drag: 0.5 });
  }

  update(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += p.g * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'leaf' || p.kind === 'petal') p.vx += Math.sin(p.life * 9 + p.rot) * 20 * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
    for (const n of this.numbers) {
      n.life -= dt;
      n.y -= dt * (n.life > 0.5 ? 26 : 8);
      n.x += n.vx * dt;
      n.vx *= Math.exp(-4 * dt);
    }
    this.numbers = this.numbers.filter((n) => n.life > 0);
  }

  draw(g: CanvasRenderingContext2D, additive: boolean): void {
    for (const p of this.list) {
      if (p.add !== additive) continue;
      const t = p.life / p.max;
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      switch (p.kind) {
        case 'glow': {
          const r = p.size * (1.2 - t * 0.2);
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          grd.addColorStop(0, `rgba(${p.color},${0.55 * t})`);
          grd.addColorStop(1, `rgba(${p.color},0)`);
          g.fillStyle = grd;
          g.fillRect(x - r, y - r, r * 2, r * 2);
          break;
        }
        case 'mote': {
          const a = Math.sin((1 - t) * Math.PI) * 0.8;
          g.fillStyle = `rgba(${p.color},${a})`;
          g.fillRect(x, y, 1, 1);
          break;
        }
        case 'ring': {
          const r = p.size * (1 - t * t);
          g.strokeStyle = p.color;
          g.globalAlpha = t;
          g.lineWidth = 1 + t * 1.5;
          g.beginPath();
          g.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
          g.stroke();
          g.globalAlpha = 1;
          break;
        }
        case 'dust': {
          g.globalAlpha = t * 0.6;
          g.fillStyle = p.color;
          const s = Math.max(1, Math.round(p.size * (1.4 - t * 0.6)));
          g.fillRect(x - (s >> 1), y - (s >> 1), s, s);
          g.globalAlpha = 1;
          break;
        }
        case 'shard': {
          g.fillStyle = p.color;
          g.globalAlpha = Math.min(1, t * 2);
          const s = Math.round(p.size);
          const cx = Math.cos(p.rot);
          const sy = Math.sin(p.rot);
          for (let i = 0; i < s; i++) g.fillRect(Math.round(x + cx * i), Math.round(y + sy * i), 1, 1);
          g.globalAlpha = 1;
          break;
        }
        case 'leaf':
        case 'petal': {
          g.globalAlpha = Math.min(1, t * 2);
          g.fillStyle = p.color;
          const horiz = Math.cos(p.rot) > 0;
          g.fillRect(x, y, horiz ? 2 : 1, horiz ? 1 : 2);
          g.globalAlpha = 1;
          break;
        }
        case 'bubble': {
          g.globalAlpha = Math.min(1, t * 1.5);
          g.fillStyle = p.color;
          const s = Math.max(1, Math.round(p.size));
          g.fillRect(x, y, s, s);
          g.globalAlpha = 1;
          break;
        }
        default: {
          g.globalAlpha = Math.min(1, t * 2.5);
          g.fillStyle = p.color;
          const s = Math.max(1, Math.round(p.size));
          g.fillRect(x, y, s, s);
          g.globalAlpha = 1;
        }
      }
    }
  }
}
