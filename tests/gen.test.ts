import { describe, expect, it } from 'vitest';
import { generateFloor, isBossFloor, validateFloor } from '../src/world/gen';
import { T } from '../src/world/tiles';

describe('floor generation', () => {
  it('produces valid floors across many seeds and all three floors', () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (const floor of [1, 2, 3]) {
        const plan = generateFloor(seed * 7919, floor);
        const v = validateFloor(plan);
        expect(v.reasons, `seed ${seed} floor ${floor}`).toEqual([]);
        if (isBossFloor(floor)) expect(plan.boss).not.toBeNull();
        else expect(plan.chests.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('is deterministic for a seed', () => {
    const a = generateFloor(12345, 2);
    const b = generateFloor(12345, 2);
    expect(Array.from(a.map.tiles)).toEqual(Array.from(b.map.tiles));
    expect(a.enemies).toEqual(b.enemies);
    expect(a.chests).toEqual(b.chests);
  });

  it('keeps the stairs footprint on clear floor', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const p = generateFloor(seed, 1);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) expect(p.map.get(p.exit.x + dx, p.exit.y + dy)).toBe(T.Floor);
    }
  });
});
