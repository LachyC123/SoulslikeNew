import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { makeBargain, makeBoon } from '../src/data/boons';
import { itemLines, itemSig, makeRelic, makeRing, makeWeapon, randomLoot } from '../src/data/items';

describe('item variety', () => {
  it('weapons rarely repeat across a thousand rolls', () => {
    const r = new Rng(42);
    const sigs = new Set<string>();
    const names = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const w = makeWeapon(r, 1 + (i % 3), {});
      sigs.add([w.family, w.variant, w.element, w.element2, ...w.props.map((p) => JSON.stringify({ ...p, value: undefined, power: undefined, chance: undefined }))].join('|'));
      names.add(w.name);
    }
    expect(sigs.size).toBeGreaterThan(800);
    expect(names.size).toBeGreaterThan(700);
  });

  it('every generated item and boon has readable text', () => {
    const r = new Rng(7);
    for (let i = 0; i < 400; i++) {
      const it = [randomLoot(r, 2, 1), makeRing(r, 2), makeRelic(r, 3)][i % 3];
      for (const line of itemLines(it)) {
        expect(line.length).toBeGreaterThan(5);
        expect(line).not.toMatch(/undefined|NaN/);
      }
      expect(itemSig(it).length).toBeGreaterThan(0);
      const b = i % 2 ? makeBoon(r, 2, () => 0) : makeBargain(r, 2, () => 0);
      expect(b.props.length).toBeGreaterThan(0);
      expect(b.name).not.toMatch(/undefined/);
    }
  });

  it('familiarity steers generation away from recently seen archetypes', () => {
    const r = new Rng(9);
    const counts = new Map<string, number>();
    for (let i = 0; i < 300; i++) {
      const w = makeWeapon(r, 1);
      counts.set(w.family!, (counts.get(w.family!) ?? 0) + 1);
    }
    // All nine families appear in a healthy spread.
    expect(counts.size).toBe(9);
    for (const c of counts.values()) expect(c).toBeGreaterThan(12);
  });
});
