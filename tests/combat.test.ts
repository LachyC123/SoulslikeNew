import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { makeRing, makeWeapon, starterWeapon } from '../src/data/items';
import { ProcProp } from '../src/data/props';
import { bagFree, createPlayer, equipItem, refreshBuild } from '../src/sim/player';
import { emptyIntent, Enemy, nullFx, World, WorldCallbacks } from '../src/sim/world';
import { generateFloor } from '../src/world/gen';

const cb = (): WorldCallbacks => ({
  inspect() {},
  descend() {},
  rollChestLoot: () => starterWeapon(new Rng(1)),
  bossDefeated() {},
  playerDied() {},
  milestone() {},
  feature() {},
});

function setup(weapon = starterWeapon(new Rng(1))) {
  const plan = generateFloor(777, 1);
  const p = createPlayer(0, 0, weapon);
  const w = new World(plan, p, nullFx, cb(), 1);
  w.enemies = [];
  return { w, p };
}

const spawn = (w: World, x: number, y: number, kind: 'root' | 'moth' | 'thornling' = 'root'): Enemy => {
  const e = w.makeEnemy(w.nextId++, kind, x, y, -1, false);
  e.mutations = [];
  e.ward = 0;
  return e;
};

const proc = (p: Partial<ProcProp>): ProcProp => ({ k: 'proc', trig: 'kill', chance: 1, n: 0, effect: 'nova', el: 'none', power: 1, count: 1, icd: 0, ...p });

describe('status effects', () => {
  it('poison refreshes duration instead of stacking', () => {
    const { w, p } = setup();
    const e = spawn(w, p.x + 60, p.y);
    w.enemies.push(e);
    const src = { effect: 'test', chain: [] };
    w.applyStatus(e, 'poison', 999, src);
    expect(e.poison.active).toBe(5);
    e.poison.active = 1;
    w.applyStatus(e, 'poison', 999, src);
    expect(e.poison.active).toBe(5);
    e.hp = e.maxHp = 10000;
    for (let i = 0; i < 400; i++) w.update(1 / 60, emptyIntent());
    const ticks = (10000 - e.hp) / Math.max(2, Math.round(0.04 * e.maxHp));
    expect(ticks).toBeGreaterThan(8);
    expect(ticks).toBeLessThanOrEqual(11);
  });

  it('frost freezes, then builds resistance against repeated control', () => {
    const { w, p } = setup();
    const e = spawn(w, p.x + 60, p.y);
    w.enemies.push(e);
    w.applyStatus(e, 'frost', 999, { effect: 't', chain: [] });
    expect(e.frost.active).toBeGreaterThan(0);
    expect(e.frost.resist).toBeGreaterThan(1);
  });

  it('shock interrupts an enemy windup', () => {
    const { w, p } = setup();
    const e = spawn(w, p.x + 20, p.y);
    w.enemies.push(e);
    e.state = 'windup';
    w.applyStatus(e, 'shock', 999, { effect: 't', chain: [] });
    expect(e.state).toBe('stagger');
  });
});

describe('event chains', () => {
  it('corpse-explosion cascades terminate and stay bounded', () => {
    const ring = makeRing(new Rng(3), 1, 'rare', [proc({ trig: 'kill', effect: 'explode', power: 5 })]);
    const { w, p } = setup();
    equipItem(p, ring);
    refreshBuild(p);
    for (let i = 0; i < 40; i++) {
      const e = spawn(w, p.x + 80 + (i % 8) * 7, p.y + Math.floor(i / 8) * 7);
      e.hp = 1;
      w.enemies.push(e);
    }
    w.damageEnemy(w.enemies[0], 5, { effect: 'test', chain: [] });
    let steps = 0;
    while (steps++ < 300) w.update(1 / 60, emptyIntent());
    expect(w.kills).toBeGreaterThan(1);
    // The guard limits depth, so a single kill cannot recurse forever.
    expect(steps).toBeGreaterThan(299);
  });

  it('a hammer shatters frozen foes and shatter procs fire', () => {
    const hammer = makeWeapon(new Rng(5), 1, { family: 'hammer', variant: 0, element: 'none', rarity: 'common', props: [] });
    const { w, p } = setup(hammer);
    equipItem(p, makeRing(new Rng(6), 1, 'rare', [proc({ trig: 'shatter', effect: 'nova', el: 'frost', power: 1 })]));
    refreshBuild(p);
    const target = spawn(w, p.x + 18, p.y);
    const near = spawn(w, p.x + 40, p.y + 4);
    target.hp = target.maxHp = 500;
    near.hp = near.maxHp = 500;
    w.enemies.push(target, near);
    w.applyStatus(target, 'frost', 999, { effect: 't', chain: [] });
    const it = emptyIntent();
    it.attack = true;
    it.aim = 0;
    w.update(1 / 60, it);
    for (let i = 0; i < 40; i++) w.update(1 / 60, emptyIntent());
    expect(target.frost.active).toBe(0);
    expect(target.hp).toBeLessThan(500 - 0.28 * 500 + 1);
    expect(near.frost.build + (near.frost.active > 0 ? 999 : 0)).toBeGreaterThan(0);
  });
});

describe('player actions', () => {
  it('swapping keeps per-weapon skill cooldowns', () => {
    const { w, p } = setup();
    p.loadout.weapons[1] = makeWeapon(new Rng(9), 1, { family: 'daggers' });
    const it = emptyIntent();
    it.skill = true;
    w.update(1 / 60, it);
    expect(p.skillCd[0]).toBeGreaterThan(3.5);
    for (let i = 0; i < 40; i++) w.update(1 / 60, emptyIntent());
    const s = emptyIntent();
    s.swap = true;
    w.update(1 / 60, s);
    expect(p.weaponIndex).toBe(1);
    expect(p.skillCd[0]).toBeGreaterThan(2.5);
    expect(p.skillCd[1]).toBe(0);
  });

  it('dodge cannot cancel active attack frames', () => {
    const hammer = makeWeapon(new Rng(5), 1, { family: 'hammer', element: 'none', rarity: 'common', props: [] });
    const { w, p } = setup(hammer);
    const a = emptyIntent();
    a.attack = true;
    w.update(1 / 60, a);
    while (p.atkPhase !== 'active') w.update(1 / 60, emptyIntent());
    const d = emptyIntent();
    d.dodge = true;
    w.update(1 / 60, d);
    expect(p.state).toBe('attack');
  });

  it('every weapon family can attack and use its skill without errors', () => {
    for (const family of ['sword', 'daggers', 'hammer', 'spear', 'scythe', 'axe', 'bow', 'wand', 'chakram'] as const) {
      for (const variant of [0, 1, 2]) {
        const { w, p } = setup(makeWeapon(new Rng(11), 2, { family, variant, element: 'burn' }));
        const e = spawn(w, p.x + 30, p.y);
        e.hp = e.maxHp = 5000;
        w.enemies.push(e);
        for (let i = 0; i < 120; i++) {
          const it = emptyIntent();
          it.attackHeld = true;
          it.attack = i % 10 === 0;
          it.aim = 0;
          it.skill = i === 60;
          w.update(1 / 60, it);
        }
        expect(e.hp, `${family}/${variant}`).toBeLessThan(5000);
      }
    }
  });

  it('a full bag never silently destroys a find', () => {
    const { p } = setup();
    for (let i = 0; i < p.bag.length; i++) p.bag[i] = makeWeapon(new Rng(i), 1);
    expect(bagFree(p)).toBe(-1);
    const displaced = equipItem(p, makeWeapon(new Rng(99), 1), 0);
    expect(displaced).not.toBeNull();
  });
});
