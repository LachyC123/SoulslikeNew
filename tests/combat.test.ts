import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { makeRing, makeWeapon, starterWeapon } from '../src/data/items';
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
});

function setup(weapon = starterWeapon(new Rng(1))) {
  const plan = generateFloor(777, 1);
  const p = createPlayer(0, 0, weapon);
  const w = new World(plan, p, nullFx, cb(), 1);
  w.enemies = [];
  return { w, p };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const spawn = (w: World, x: number, y: number, kind: 'root' | 'moth' | 'thornling' = 'root'): Enemy => (w as any).makeEnemy(w.nextId++, kind, x, y, -1, false);

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
    // Ticks are bounded by duration: about 10 ticks over 5 seconds.
    const hp0 = e.hp = e.maxHp = 10000;
    for (let i = 0; i < 400; i++) w.update(1 / 60, emptyIntent());
    const ticks = (hp0 - e.hp) / Math.max(2, Math.round(0.04 * e.maxHp));
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
});

describe('event chains', () => {
  it('spore cascades terminate and stay bounded', () => {
    const ring = makeRing(new Rng(3), 1, 'sporeBloom');
    const { w, p } = setup();
    equipItem(p, ring);
    refreshBuild(p, 0);
    // A tight cluster of fragile, poisoned enemies.
    for (let i = 0; i < 30; i++) {
      const e = spawn(w, p.x + 80 + (i % 6) * 6, p.y + Math.floor(i / 6) * 6);
      e.hp = 1;
      e.poison.active = 5;
      e.poison.tick = 0.01;
      w.enemies.push(e);
    }
    let steps = 0;
    while (w.enemies.some((e) => e.state !== 'dead') && steps++ < 2000) w.update(1 / 60, emptyIntent());
    expect(steps).toBeLessThan(2000);
    expect(w.kills).toBe(30);
  });

  it('a hammer shatters frozen foes and a nova ring spreads frost', () => {
    const hammer = makeWeapon(new Rng(5), 1, { family: 'hammer', element: 'none', rarity: 'common', affixes: [] });
    const { w, p } = setup(hammer);
    equipItem(p, makeRing(new Rng(6), 1, 'frostNova'));
    refreshBuild(p, 0);
    const target = spawn(w, p.x + 18, p.y);
    const near = spawn(w, p.x + 40, p.y + 4);
    target.hp = target.maxHp = 500;
    near.hp = near.maxHp = 500;
    w.enemies.push(target, near);
    w.applyStatus(target, 'frost', 999, { effect: 't', chain: [] });
    expect(target.frost.active).toBeGreaterThan(0);
    p.face = 0;
    const it = emptyIntent();
    it.attack = true;
    it.aim = 0;
    w.update(1 / 60, it);
    for (let i = 0; i < 40; i++) w.update(1 / 60, emptyIntent());
    expect(target.frost.active).toBe(0); // shattered
    expect(target.hp).toBeLessThan(500 - 0.3 * 500 + 1);
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
    expect(p.skillCd[0]).toBeGreaterThan(4);
    for (let i = 0; i < 40; i++) w.update(1 / 60, emptyIntent());
    const s = emptyIntent();
    s.swap = true;
    w.update(1 / 60, s);
    expect(p.weaponIndex).toBe(1);
    expect(p.skillCd[0]).toBeGreaterThan(3);
    expect(p.skillCd[1]).toBe(0);
  });

  it('dodge cannot cancel active attack frames', () => {
    const hammer = makeWeapon(new Rng(5), 1, { family: 'hammer', element: 'none', rarity: 'common', affixes: [] });
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

  it('a full bag never silently destroys a find', () => {
    const { p } = setup();
    for (let i = 0; i < p.bag.length; i++) p.bag[i] = makeWeapon(new Rng(i), 1);
    expect(bagFree(p)).toBe(-1);
    const displaced = equipItem(p, makeWeapon(new Rng(99), 1), 0);
    expect(displaced).not.toBeNull();
  });
});
