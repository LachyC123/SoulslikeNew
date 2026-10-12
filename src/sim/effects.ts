import { Element, StatusEl } from '../data/elements';
import { ProcProp } from '../data/props';
import { AttackStep } from '../data/weapons';
import { weaponStats, WeaponStats } from './player';
import type { Enemy, HitSpec, Intent, Src, World } from './world';

/** Base damage for triggered effects: half a second of the active weapon's sustained damage. */
function base(w: World): number {
  return weaponStats(w.player)?.procBase ?? 8;
}

function elMul(w: World, el: Element): number {
  return el === 'none' ? 1 : 1 + w.player.build.elDmg[el as StatusEl] / 100;
}

function procSpec(_w: World, dmg: number, el: Element, src: Src, build = 35, heavy = false): HitSpec {
  return { dmg, el, build: el === 'none' ? 0 : build, poise: 15, knock: 40, dir: 0, heavy, kind: 'proc', src };
}

export function nova(w: World, x: number, y: number, r: number, dmg: number, el: Element, src: Src, build = 45, heavy = false) {
  w.fx.burst('nova', x, y - 4, 0, r / 40, el);
  w.fx.sound(el === 'shock' ? 'zap' : el === 'burn' ? 'fire' : 'magic', 0.7);
  for (const e of w.enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d - e.r > r) continue;
    const spec = procSpec(w, dmg, el, src, build, heavy);
    spec.dir = Math.atan2(e.y - y, e.x - x);
    spec.knock = 90;
    w.playerHit(e, spec);
  }
}

export function chain(w: World, from: Enemy | null, x: number, y: number, jumps: number, dmg: number, el: Element, src: Src) {
  const hit = new Set<number>();
  let cur: { x: number; y: number } = from ?? { x, y };
  let target = from && from.state !== 'dead' ? from : w.nearestEnemy(x, y, 90);
  for (let i = 0; i < jumps && target; i++) {
    hit.add(target.id);
    w.fx.beam(cur.x, cur.y - 6, target.x, target.y - 6, el, 'chain');
    w.playerHit(target, procSpec(w, dmg, el, src, 40));
    cur = target;
    target = w.nearestEnemy(cur.x, cur.y, 80, null, hit);
  }
  w.fx.sound('zap', 0.6);
}

export function doEffect(w: World, p: ProcProp, x: number, y: number, target: Enemy | null, src: Src): void {
  const pl = w.player;
  const b = pl.build;
  const dmg = base(w) * p.power * elMul(w, p.el);
  const aoe = b.aoe;
  const extra = b.proj;
  switch (p.effect) {
    case 'nova':
      nova(w, x, y, 42 * aoe, dmg, p.el, src);
      break;
    case 'explode':
      nova(w, x, y, 36 * aoe, dmg, p.el, src, 50, true);
      w.fx.burst('explosion', x, y, 0, aoe, p.el);
      w.fx.sound('boom', 0.6);
      break;
    case 'bolts': {
      const n = p.count + extra;
      const t = target && target.state !== 'dead' ? target : w.nearestEnemy(pl.x, pl.y, 160);
      const a0 = t ? Math.atan2(t.y - pl.y, t.x - pl.x) : pl.face;
      for (let i = 0; i < n; i++) {
        const a = a0 + (i - (n - 1) / 2) * 0.45 + (Math.random() - 0.5) * 0.2;
        w.spawnPlayerProj('bolt', pl.x, pl.y - 8, a, 170, 1.1, 3, procSpec(w, dmg, p.el, src, 30), { homing: 6 });
      }
      w.fx.sound('magic', 0.5);
      break;
    }
    case 'shards': {
      const n = p.count + extra;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
        w.spawnPlayerProj('shard', x, y - 4, a, 190, 0.45 * aoe, 3, procSpec(w, dmg, p.el, src, 25), { pierce: 1 });
      }
      w.fx.burst('nova', x, y - 4, 0, 0.5, p.el);
      break;
    }
    case 'chain':
      chain(w, target, x, y, p.count + extra, dmg, p.el, src);
      break;
    case 'meteor': {
      const t = target && target.state !== 'dead' ? target : w.nearestEnemy(x, y, 160);
      const tx = t?.x ?? x;
      const ty = t?.y ?? y;
      w.addHazard('meteor', 'player', tx, ty, 34 * aoe, 0.6, dmg, 70, 0.3, p.el, '', src);
      w.fx.sound('magic', 0.5);
      break;
    }
    case 'vortex':
      w.addHazard('vortex', 'player', x, y, 46 * aoe, 0, dmg * 0.4, 25, 2, p.el, '', src);
      w.fx.sound('magic', 0.6);
      break;
    case 'spores':
      w.addHazard('cloud', 'player', x, y, 32 * aoe, 0, Math.max(1, dmg * 0.5), 30, 3, p.el === 'none' ? 'poison' : p.el, '', src);
      break;
    case 'orbit':
      for (let i = 0; i < p.count; i++)
        w.allies.push({ id: w.nextId++, kind: 'orbit', x: pl.x, y: pl.y, t: 0, life: 4, el: p.el, power: p.power, cd: 0, angle: (i / p.count) * Math.PI * 2, hits: new Map() });
      w.fx.sound('magic', 0.6);
      break;
    case 'wisp':
      w.allies.push({ id: w.nextId++, kind: 'wisp', x: pl.x, y: pl.y - 10, t: 0, life: 6, el: p.el, power: p.power, cd: 0.3, angle: Math.random() * 6, hits: new Map() });
      w.fx.burst('summon', pl.x, pl.y - 10, 0, 1, p.el);
      break;
    case 'echo': {
      if (p.trig === 'dodge') pl.echoArmed = Math.max(pl.echoArmed, p.power);
      else {
        const ws = weaponStats(pl);
        if (ws) echoSwing(w, ws, ws.combo[pl.atkStep] ?? ws.combo[0], p.power, false);
      }
      break;
    }
    case 'heal':
      w.healPlayer(p.power);
      w.fx.burst('heal', pl.x, pl.y - 6, 0, 0.6);
      break;
    case 'shield':
      pl.shield = Math.min(b.maxHp, pl.shield + p.power);
      pl.shieldT = 6;
      w.fx.burst('shield', pl.x, pl.y - 8);
      w.fx.sound('shield', 0.6);
      break;
    case 'haste':
      pl.hasteT = 3;
      pl.hastePct = Math.max(pl.hastePct * (pl.hasteT > 0 ? 1 : 0), p.power);
      w.fx.burst('haste', pl.x, pl.y - 6);
      break;
    case 'cdr':
      pl.skillCd[pl.weaponIndex] = Math.max(0, pl.skillCd[pl.weaponIndex] - p.power);
      break;
  }
}

/** A shadow repeats the current swing at a fraction of its power. */
export function echoSwing(w: World, ws: WeaponStats, s: AttackStep, power: number, finisher: boolean) {
  const pl = w.player;
  const dir = pl.atkDir;
  const ox = pl.x;
  const oy = pl.y;
  w.echoQueue.push({
    t: w.time + 0.15,
    fn: () => {
      w.fx.burst('blink', ox + Math.cos(dir) * 8, oy - 6 + Math.sin(dir) * 8, dir, 0.6, 'none');
      w.fx.sound(ws.fam.heavy ? 'swingHeavy' : 'swing', 0.5);
      if (s.shot) w.fireShot(ws, s, dir, false, power, 'proc');
      else {
        const spec = w.attackSpec(ws, s, finisher, power, 'proc');
        spec.src = { effect: 'echo', chain: ['echo'] };
        w.resolveMelee(s.reach * ws.reachMul, s.arc, w.nextId++, spec, ox, oy, dir);
      }
    },
  });
}

export function updateAllies(w: World, dt: number) {
  const pl = w.player;
  const bdmg = base(w);
  for (const a of w.allies) {
    a.t += dt;
    a.cd -= dt;
    if (a.kind === 'orbit') {
      a.angle += dt * 5;
      a.x = pl.x + Math.cos(a.angle) * 24;
      a.y = pl.y - 4 + Math.sin(a.angle) * 18;
      for (const e of w.enemies) {
        if (e.state === 'dead') continue;
        const last = a.hits.get(e.id) ?? -9;
        if (w.time - last < 0.35 || Math.hypot(e.x - a.x, e.y - 4 - a.y) > e.r + 5) continue;
        a.hits.set(e.id, w.time);
        w.playerHit(e, { dmg: bdmg * a.power * elMul(w, a.el), el: a.el, build: 25, poise: 10, knock: 50, dir: a.angle + Math.PI / 2, heavy: false, kind: 'ally', src: { effect: 'orbit', chain: ['orbit'] } });
      }
    } else if (a.kind === 'wisp' || a.kind === 'spirit' || a.kind === 'turret') {
      if (a.kind !== 'turret') {
        // Hover around the player.
        a.angle += dt * 1.5;
        const tx = pl.x + Math.cos(a.angle) * 18;
        const ty = pl.y - 16 + Math.sin(a.angle * 2) * 4;
        a.x += (tx - a.x) * Math.min(1, dt * 5);
        a.y += (ty - a.y) * Math.min(1, dt * 5);
      }
      if (a.cd <= 0) {
        const t = w.nearestEnemy(a.x, a.y, a.kind === 'turret' ? 170 : 150);
        if (t && w.map.lineOfSight(a.x, a.y, t.x, t.y)) {
          a.cd = a.kind === 'turret' ? 0.55 : a.kind === 'spirit' ? 0.7 : 0.8;
          const ang = Math.atan2(t.y - 4 - a.y, t.x - a.x);
          w.spawnPlayerProj('bolt', a.x, a.y, ang, 190, 1, 3, { dmg: bdmg * a.power * elMul(w, a.el), el: a.el, build: 25, poise: 6, knock: 30, dir: ang, heavy: false, kind: 'ally', src: { effect: a.kind, chain: [a.kind] } }, { homing: 4 });
        }
      }
    } else if (a.kind === 'decoy' && a.t >= a.life) {
      nova(w, a.x, a.y, 40, bdmg * a.power, 'none', { effect: 'decoy', chain: ['decoy'] }, 0, true);
      w.fx.burst('explosion', a.x, a.y, 0, 1, 'none');
    }
  }
  w.allies = w.allies.filter((a) => a.t < a.life);
}

export function useRelic(w: World, intent: Intent) {
  const pl = w.player;
  const relic = pl.loadout.relic!;
  const r = relic.relic!;
  pl.relicCd = r.cooldown * pl.build.skillCdMul;
  const bdmg = base(w);
  const aim = w.chooseAim(intent, 140);
  const src: Src = { effect: 'relic', chain: ['relic'] };
  w.fx.sound('magic');
  switch (r.ability) {
    case 'blink': {
      const d = Math.min(84, w.rayLength(pl.x, pl.y, aim, 84));
      w.fx.burst('blink', pl.x, pl.y - 6, aim, 1, r.el);
      w.moveBody(pl, Math.cos(aim) * d, Math.sin(aim) * d, false);
      pl.invuln = Math.max(pl.invuln, 0.35);
      nova(w, pl.x, pl.y, 40 * pl.build.aoe, bdmg * r.power, r.el, src);
      break;
    }
    case 'nova':
      nova(w, pl.x, pl.y, 78 * pl.build.aoe, bdmg * r.power, r.el, src, 70, true);
      w.fx.shake(4);
      break;
    case 'meteor': {
      const targets = w.enemies.filter((e) => e.state !== 'dead' && Math.hypot(e.x - pl.x, e.y - pl.y) < 180).sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
      for (let i = 0; i < r.count; i++) {
        const t = targets[i % Math.max(1, targets.length)];
        const tx = t ? t.x + (Math.random() - 0.5) * 16 : pl.x + Math.cos(aim) * 40 + (Math.random() - 0.5) * 50;
        const ty = t ? t.y + (Math.random() - 0.5) * 16 : pl.y + Math.sin(aim) * 40 + (Math.random() - 0.5) * 50;
        w.addHazard('meteor', 'player', tx, ty, 32 * pl.build.aoe, 0.5 + i * 0.18, bdmg * r.power, 80, 0.3, r.el, '', src);
      }
      break;
    }
    case 'vortex':
      w.addHazard('vortex', 'player', pl.x + Math.cos(aim) * 50, pl.y + Math.sin(aim) * 50, 60 * pl.build.aoe, 0, bdmg * r.power, 30, 2.5, r.el, '', src);
      break;
    case 'spirits':
      for (let i = 0; i < r.count; i++)
        w.allies.push({ id: w.nextId++, kind: 'spirit', x: pl.x, y: pl.y - 10, t: 0, life: 9, el: r.el, power: 0.45, cd: 0.2 * i, angle: (i / r.count) * Math.PI * 2, hits: new Map() });
      w.fx.burst('summon', pl.x, pl.y - 10, 0, 1.4, r.el);
      break;
    case 'bubble':
      pl.shield = Math.max(pl.shield, r.power);
      pl.shieldT = 8;
      w.fx.burst('shield', pl.x, pl.y - 8, 0, 1.5);
      w.fx.sound('shield');
      break;
    case 'timeslow':
      w.slowT = 4;
      w.fx.burst('nova', pl.x, pl.y - 6, 0, 3, 'none');
      w.fx.callout('TIME SLOWS', 1);
      break;
    case 'storm':
      for (let i = 0; i < r.count; i++) {
        w.echoQueue.push({
          t: w.time + (i / r.count) * 3,
          fn: () => {
            const live = w.enemies.filter((e) => e.state !== 'dead' && Math.hypot(e.x - pl.x, e.y - pl.y) < 190);
            const t = live[Math.floor(Math.random() * live.length)];
            if (t) w.addHazard('strike', 'player', t.x, t.y, 18 * pl.build.aoe, 0.25, bdmg * r.power, 60, 0.15, r.el === 'none' ? 'shock' : r.el, '', src);
          },
        });
      }
      break;
    case 'turret':
      w.allies.push({ id: w.nextId++, kind: 'turret', x: pl.x, y: pl.y - 4, t: 0, life: 9, el: r.el, power: r.power, cd: 0.3, angle: 0, hits: new Map() });
      w.fx.burst('summon', pl.x, pl.y - 4, 0, 1, r.el);
      break;
    case 'quake':
      for (let i = 0; i < r.count; i++)
        w.echoQueue.push({
          t: w.time + i * 0.28,
          fn: () => {
            nova(w, pl.x, pl.y, (40 + i * 26) * pl.build.aoe, bdmg * r.power, r.el, src, 40, true);
            w.fx.burst('fracture', pl.x, pl.y, 0, 0.6 + i * 0.3);
            w.fx.shake(3);
          },
        });
      break;
    case 'warcry':
      pl.warcryT = 6;
      pl.warcryPct = r.power;
      w.fx.burst('roar', pl.x, pl.y - 8, 0, 0.6);
      w.fx.callout('WARCRY', 1);
      break;
    case 'mirror':
      pl.mirrorT = 7;
      pl.mirrorPct = r.power;
      w.fx.burst('blink', pl.x, pl.y - 6, 0, 1.4, 'none');
      break;
  }
}
